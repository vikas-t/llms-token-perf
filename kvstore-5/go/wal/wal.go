package wal

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// LogEntry represents a single operation in the WAL
type LogEntry struct {
	Op        string      `json:"op"`
	Key       string      `json:"key"`
	Value     interface{} `json:"value,omitempty"`
	TTL       *int        `json:"ttl,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

// WAL manages the write-ahead log for persistence
type WAL struct {
	mu       sync.Mutex
	file     *os.File
	writer   *bufio.Writer
	filePath string
}

// New creates a new WAL instance
func New(dataDir string) (*WAL, error) {
	// Create data directory if it doesn't exist
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	filePath := filepath.Join(dataDir, "wal.log")

	// Open file in append mode
	file, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open WAL file: %w", err)
	}

	return &WAL{
		file:     file,
		writer:   bufio.NewWriter(file),
		filePath: filePath,
	}, nil
}

// Append writes an operation to the WAL
func (w *WAL) Append(op string, key string, value interface{}, ttl *int) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	entry := LogEntry{
		Op:        op,
		Key:       key,
		Value:     value,
		TTL:       ttl,
		Timestamp: time.Now().Unix(),
	}

	// Marshal to JSON
	jsonBytes, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("failed to marshal log entry: %w", err)
	}

	// Write to file
	if _, err := w.writer.Write(jsonBytes); err != nil {
		return fmt.Errorf("failed to write to WAL: %w", err)
	}
	if _, err := w.writer.WriteString("\n"); err != nil {
		return fmt.Errorf("failed to write newline to WAL: %w", err)
	}

	// Flush to ensure durability
	if err := w.writer.Flush(); err != nil {
		return fmt.Errorf("failed to flush WAL: %w", err)
	}

	return nil
}

// Replay reads the WAL and returns all log entries
func (w *WAL) Replay() ([]LogEntry, error) {
	// Open file for reading
	file, err := os.Open(w.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			// File doesn't exist yet, return empty log
			return []LogEntry{}, nil
		}
		return nil, fmt.Errorf("failed to open WAL for replay: %w", err)
	}
	defer file.Close()

	entries := make([]LogEntry, 0)
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var entry LogEntry
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			// Skip malformed lines
			continue
		}

		entries = append(entries, entry)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading WAL: %w", err)
	}

	return entries, nil
}

// Close closes the WAL file
func (w *WAL) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if err := w.writer.Flush(); err != nil {
		return err
	}
	return w.file.Close()
}
