package server

import (
	"encoding/json"
	"kvstore/store"
	"kvstore/wal"
	"net/http"
	"strings"
)

// Server holds the store and WAL instances
type Server struct {
	Store *store.KVStore
	WAL   *wal.WAL
}

// NewServer creates a new Server instance
func NewServer(kvstore *store.KVStore, walInstance *wal.WAL) *Server {
	return &Server{
		Store: kvstore,
		WAL:   walInstance,
	}
}

// HandleStats returns store statistics
func (s *Server) HandleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	keys, sizeBytes := s.Store.Stats()
	response := map[string]interface{}{
		"keys":       keys,
		"size_bytes": sizeBytes,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleListKeys lists all keys with optional prefix filtering
func (s *Server) HandleListKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	prefix := r.URL.Query().Get("prefix")
	keys := s.Store.ListKeys(prefix)

	response := map[string]interface{}{
		"keys": keys,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleGet retrieves a value by key
func (s *Server) HandleGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract key from path: /kv/:key
	key := strings.TrimPrefix(r.URL.Path, "/kv/")
	if key == "" || key == r.URL.Path {
		http.Error(w, "Key required", http.StatusBadRequest)
		return
	}

	value, exists := s.Store.Get(key)
	if !exists {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "key not found",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"value": value,
	})
}

// HandlePut sets a key-value pair
func (s *Server) HandlePut(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract key from path
	key := strings.TrimPrefix(r.URL.Path, "/kv/")
	if key == "" || key == r.URL.Path {
		http.Error(w, "Key required", http.StatusBadRequest)
		return
	}

	// Parse request body
	var body struct {
		Value interface{} `json:"value"`
		TTL   *int        `json:"ttl"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Append to WAL first
	if err := s.WAL.Append("set", key, body.Value, body.TTL); err != nil {
		http.Error(w, "Failed to write to WAL", http.StatusInternalServerError)
		return
	}

	// Update store
	s.Store.Set(key, body.Value, body.TTL)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// HandleDelete deletes a key
func (s *Server) HandleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract key from path
	key := strings.TrimPrefix(r.URL.Path, "/kv/")
	if key == "" || key == r.URL.Path {
		http.Error(w, "Key required", http.StatusBadRequest)
		return
	}

	// Check if key exists before deleting
	if _, exists := s.Store.Get(key); !exists {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error": "key not found",
		})
		return
	}

	// Append to WAL first
	if err := s.WAL.Append("delete", key, nil, nil); err != nil {
		http.Error(w, "Failed to write to WAL", http.StatusInternalServerError)
		return
	}

	// Delete from store
	s.Store.Delete(key)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// HandleBatch processes batch operations
func (s *Server) HandleBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse batch request
	var body struct {
		Operations []struct {
			Op    string      `json:"op"`
			Key   string      `json:"key"`
			Value interface{} `json:"value"`
			TTL   *int        `json:"ttl"`
		} `json:"operations"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	results := make([]map[string]interface{}, 0, len(body.Operations))

	for _, op := range body.Operations {
		switch op.Op {
		case "set":
			// Append to WAL
			if err := s.WAL.Append("set", op.Key, op.Value, op.TTL); err != nil {
				results = append(results, map[string]interface{}{
					"error": "Failed to write to WAL",
				})
				continue
			}

			// Update store
			s.Store.Set(op.Key, op.Value, op.TTL)
			results = append(results, map[string]interface{}{
				"success": true,
			})

		case "get":
			value, exists := s.Store.Get(op.Key)
			if !exists {
				results = append(results, map[string]interface{}{
					"error": "key not found",
				})
			} else {
				results = append(results, map[string]interface{}{
					"value": value,
				})
			}

		case "delete":
			// Check if key exists
			if _, exists := s.Store.Get(op.Key); !exists {
				results = append(results, map[string]interface{}{
					"error": "key not found",
				})
				continue
			}

			// Append to WAL
			if err := s.WAL.Append("delete", op.Key, nil, nil); err != nil {
				results = append(results, map[string]interface{}{
					"error": "Failed to write to WAL",
				})
				continue
			}

			// Delete from store
			s.Store.Delete(op.Key)
			results = append(results, map[string]interface{}{
				"success": true,
			})

		default:
			results = append(results, map[string]interface{}{
				"error": "unknown operation",
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
	})
}
