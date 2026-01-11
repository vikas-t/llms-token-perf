package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Entry represents a key-value entry with optional TTL
type Entry struct {
	Value     any       `json:"value"`
	ExpiresAt time.Time `json:"expires_at,omitempty"`
	HasTTL    bool      `json:"has_ttl"`
}

// IsExpired checks if the entry has expired
func (e *Entry) IsExpired() bool {
	if !e.HasTTL {
		return false
	}
	return time.Now().After(e.ExpiresAt)
}

// WALEntry represents an entry in the write-ahead log
type WALEntry struct {
	Op        string `json:"op"` // "set" or "delete"
	Key       string `json:"key"`
	Value     any    `json:"value,omitempty"`
	ExpiresAt int64  `json:"expires_at,omitempty"` // Unix timestamp, 0 means no TTL
	HasTTL    bool   `json:"has_ttl,omitempty"`
}

// Store is the main key-value store
type Store struct {
	mu              sync.RWMutex
	data            map[string]*Entry
	walFile         *os.File
	walPath         string
	totalOperations int64
	startTime       time.Time
}

// NewStore creates a new store with persistence
func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	walPath := filepath.Join(dataDir, "wal.log")
	s := &Store{
		data:      make(map[string]*Entry),
		walPath:   walPath,
		startTime: time.Now(),
	}

	// Replay WAL if it exists
	if err := s.replayWAL(); err != nil {
		return nil, fmt.Errorf("failed to replay WAL: %w", err)
	}

	// Open WAL for appending
	walFile, err := os.OpenFile(walPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open WAL: %w", err)
	}
	s.walFile = walFile

	return s, nil
}

// replayWAL replays the write-ahead log to restore state
func (s *Store) replayWAL() error {
	file, err := os.Open(s.walPath)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var entry WALEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			continue // Skip malformed entries
		}

		switch entry.Op {
		case "set":
			e := &Entry{
				Value:  entry.Value,
				HasTTL: entry.HasTTL,
			}
			if entry.HasTTL {
				e.ExpiresAt = time.Unix(entry.ExpiresAt, 0)
			}
			s.data[entry.Key] = e
		case "delete":
			delete(s.data, entry.Key)
		}
	}

	return scanner.Err()
}

// appendWAL writes an entry to the write-ahead log
func (s *Store) appendWAL(entry WALEntry) error {
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	_, err = s.walFile.Write(append(data, '\n'))
	if err != nil {
		return err
	}
	return s.walFile.Sync()
}

// Get retrieves a value by key
func (s *Store) Get(key string) (*Entry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	s.totalOperations++

	entry, exists := s.data[key]
	if !exists {
		return nil, false
	}
	if entry.IsExpired() {
		return nil, false
	}
	return entry, true
}

// Set stores a value with optional TTL
func (s *Store) Set(key string, value any, ttl *float64) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.totalOperations++

	_, existed := s.data[key]
	// Check if existing entry is expired
	if existed && s.data[key].IsExpired() {
		existed = false
	}

	entry := &Entry{
		Value: value,
	}

	walEntry := WALEntry{
		Op:    "set",
		Key:   key,
		Value: value,
	}

	if ttl != nil {
		entry.HasTTL = true
		entry.ExpiresAt = time.Now().Add(time.Duration(*ttl * float64(time.Second)))
		walEntry.HasTTL = true
		walEntry.ExpiresAt = entry.ExpiresAt.Unix()
	}

	if err := s.appendWAL(walEntry); err != nil {
		return false, err
	}

	s.data[key] = entry
	return !existed, nil
}

// Delete removes a key
func (s *Store) Delete(key string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.totalOperations++

	entry, exists := s.data[key]
	if !exists || entry.IsExpired() {
		return false, nil
	}

	if err := s.appendWAL(WALEntry{Op: "delete", Key: key}); err != nil {
		return false, err
	}

	delete(s.data, key)
	return true, nil
}

// List returns all keys, optionally filtered by prefix
func (s *Store) List(prefix string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	s.totalOperations++

	var keys []string
	for k, entry := range s.data {
		if entry.IsExpired() {
			continue
		}
		if prefix == "" || strings.HasPrefix(k, prefix) {
			keys = append(keys, k)
		}
	}
	return keys
}

// Stats returns store statistics
func (s *Store) Stats() (totalKeys int, totalOps int64, uptimeSecs float64) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	for _, entry := range s.data {
		if !entry.IsExpired() {
			count++
		}
	}

	return count, s.totalOperations, time.Since(s.startTime).Seconds()
}

// Server handles HTTP requests
type Server struct {
	store *Store
}

// NewServer creates a new HTTP server
func NewServer(store *Store) *Server {
	return &Server{store: store}
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	totalKeys, totalOps, uptimeSecs := s.store.Stats()
	writeJSON(w, http.StatusOK, map[string]any{
		"total_keys":       totalKeys,
		"total_operations": totalOps,
		"uptime_seconds":   uptimeSecs,
	})
}

func (s *Server) handleKVList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	prefix := r.URL.Query().Get("prefix")
	keys := s.store.List(prefix)
	if keys == nil {
		keys = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": keys})
}

func (s *Server) handleKVBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Operations []struct {
			Op    string  `json:"op"`
			Key   string  `json:"key"`
			Value any     `json:"value"`
			TTL   *float64 `json:"ttl"`
		} `json:"operations"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
		return
	}

	var results []map[string]any
	for _, op := range req.Operations {
		switch op.Op {
		case "set":
			created, err := s.store.Set(op.Key, op.Value, op.TTL)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			results = append(results, map[string]any{
				"key":     op.Key,
				"value":   op.Value,
				"created": created,
			})
		case "delete":
			deleted, err := s.store.Delete(op.Key)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			results = append(results, map[string]any{
				"key":     op.Key,
				"deleted": deleted,
			})
		default:
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("Unknown operation: %s", op.Op)})
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"results": results,
	})
}

func (s *Server) handleKV(w http.ResponseWriter, r *http.Request) {
	// Extract key from path: /kv/:key
	path := strings.TrimPrefix(r.URL.Path, "/kv/")
	if path == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Key is required"})
		return
	}
	key := path

	switch r.Method {
	case http.MethodGet:
		entry, exists := s.store.Get(key)
		if !exists {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Key not found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"key":   key,
			"value": entry.Value,
		})

	case http.MethodPut:
		var req struct {
			Value any      `json:"value"`
			TTL   *float64 `json:"ttl"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON"})
			return
		}

		created, err := s.store.Set(key, req.Value, req.TTL)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"key":     key,
			"value":   req.Value,
			"created": created,
		})

	case http.MethodDelete:
		deleted, err := s.store.Delete(key)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if !deleted {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Key not found"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": true})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	port := flag.Int("port", 8080, "Port to listen on")
	dataDir := flag.String("data-dir", "", "Data directory for persistence")
	flag.Parse()

	// Environment variables override flags
	if envPort := os.Getenv("PORT"); envPort != "" {
		fmt.Sscanf(envPort, "%d", port)
	}
	if envDataDir := os.Getenv("DATA_DIR"); envDataDir != "" {
		*dataDir = envDataDir
	}

	// Default data directory
	if *dataDir == "" {
		*dataDir = "./data"
	}

	store, err := NewStore(*dataDir)
	if err != nil {
		log.Fatalf("Failed to create store: %v", err)
	}

	server := NewServer(store)

	mux := http.NewServeMux()
	mux.HandleFunc("/stats", server.handleStats)
	mux.HandleFunc("/kv", server.handleKVList)
	mux.HandleFunc("/kv/batch", server.handleKVBatch)
	mux.HandleFunc("/kv/", server.handleKV)

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Starting KVStore server on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
