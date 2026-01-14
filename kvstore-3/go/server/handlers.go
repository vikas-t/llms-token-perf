package server

import (
	"encoding/json"
	"kvstore/store"
	"kvstore/wal"
	"net/http"
	"strings"
)

// Server holds dependencies for HTTP handlers
type Server struct {
	Store *store.KVStore
	WAL   *wal.WAL
}

// HandleStats returns store statistics
func (s *Server) HandleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	keys, sizeBytes := s.Store.Stats()

	response := map[string]int{
		"keys":       keys,
		"size_bytes": sizeBytes,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleListKeys lists all keys with optional prefix filter
func (s *Server) HandleListKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	prefix := r.URL.Query().Get("prefix")
	keys := s.Store.ListKeys(prefix)

	response := map[string][]string{
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
		w.WriteHeader(http.StatusNotFound)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "key not found",
		})
		return
	}

	response := map[string]interface{}{
		"value": value,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandlePut sets or updates a key
func (s *Server) HandlePut(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract key from path: /kv/:key
	key := strings.TrimPrefix(r.URL.Path, "/kv/")
	if key == "" || key == r.URL.Path {
		http.Error(w, "Key required", http.StatusBadRequest)
		return
	}

	// Parse request body
	var req struct {
		Value interface{} `json:"value"`
		TTL   *int        `json:"ttl,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Log to WAL first
	if err := s.WAL.LogSet(key, req.Value, req.TTL); err != nil {
		http.Error(w, "Failed to log operation", http.StatusInternalServerError)
		return
	}

	// Apply to store
	s.Store.Set(key, req.Value, req.TTL)

	response := map[string]bool{
		"success": true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleDelete removes a key
func (s *Server) HandleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract key from path: /kv/:key
	key := strings.TrimPrefix(r.URL.Path, "/kv/")
	if key == "" || key == r.URL.Path {
		http.Error(w, "Key required", http.StatusBadRequest)
		return
	}

	// Check if key exists before deletion
	_, exists := s.Store.Get(key)
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"error": "key not found",
		})
		return
	}

	// Log to WAL first
	if err := s.WAL.LogDelete(key); err != nil {
		http.Error(w, "Failed to log operation", http.StatusInternalServerError)
		return
	}

	// Apply to store
	s.Store.Delete(key)

	response := map[string]bool{
		"success": true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleBatch executes multiple operations
func (s *Server) HandleBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse request
	var req struct {
		Operations []map[string]interface{} `json:"operations"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	results := make([]map[string]interface{}, 0, len(req.Operations))

	for _, op := range req.Operations {
		opType, ok := op["op"].(string)
		if !ok {
			results = append(results, map[string]interface{}{
				"error": "missing or invalid 'op' field",
			})
			continue
		}

		key, ok := op["key"].(string)
		if !ok {
			results = append(results, map[string]interface{}{
				"error": "missing or invalid 'key' field",
			})
			continue
		}

		switch opType {
		case "set":
			value := op["value"]

			var ttl *int
			if ttlVal, ok := op["ttl"]; ok {
				if ttlFloat, ok := ttlVal.(float64); ok {
					ttlInt := int(ttlFloat)
					ttl = &ttlInt
				}
			}

			// Log to WAL
			if err := s.WAL.LogSet(key, value, ttl); err != nil {
				results = append(results, map[string]interface{}{
					"error": "failed to log operation",
				})
				continue
			}

			// Apply to store
			s.Store.Set(key, value, ttl)

			results = append(results, map[string]interface{}{
				"success": true,
			})

		case "get":
			value, exists := s.Store.Get(key)
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
			_, exists := s.Store.Get(key)
			if !exists {
				results = append(results, map[string]interface{}{
					"error": "key not found",
				})
				continue
			}

			// Log to WAL
			if err := s.WAL.LogDelete(key); err != nil {
				results = append(results, map[string]interface{}{
					"error": "failed to log operation",
				})
				continue
			}

			// Apply to store
			s.Store.Delete(key)

			results = append(results, map[string]interface{}{
				"success": true,
			})

		default:
			results = append(results, map[string]interface{}{
				"error": "unknown operation: " + opType,
			})
		}
	}

	response := map[string]interface{}{
		"results": results,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
