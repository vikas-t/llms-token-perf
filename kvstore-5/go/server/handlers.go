package server

import (
	"encoding/json"
	"kvstore/store"
	"net/http"
	"strings"
)

// Server holds the store and HTTP handlers
type Server struct {
	Store *store.KVStore
}

// HandleStats handles GET /stats
func (s *Server) HandleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	totalKeys, totalOps, uptime := s.Store.Stats()

	response := map[string]interface{}{
		"total_keys":        totalKeys,
		"total_operations":  totalOps,
		"uptime_seconds":    uptime,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleListKeys handles GET /kv
func (s *Server) HandleListKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	prefix := r.URL.Query().Get("prefix")
	keys := s.Store.List(prefix)

	response := map[string]interface{}{
		"keys": keys,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleKey handles GET/PUT/DELETE /kv/:key
func (s *Server) HandleKey(w http.ResponseWriter, r *http.Request) {
	// Extract key from path
	path := r.URL.Path
	key := strings.TrimPrefix(path, "/kv/")

	if key == "" {
		http.Error(w, "Key is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.handleGet(w, r, key)
	case http.MethodPut:
		s.handlePut(w, r, key)
	case http.MethodDelete:
		s.handleDelete(w, r, key)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request, key string) {
	value, exists := s.Store.Get(key)
	if !exists {
		w.WriteHeader(http.StatusNotFound)
		response := map[string]interface{}{
			"error": "key not found",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	response := map[string]interface{}{
		"key":   key,
		"value": value,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handlePut(w http.ResponseWriter, r *http.Request, key string) {
	var body struct {
		Value interface{} `json:"value"`
		TTL   *int        `json:"ttl"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	created := s.Store.Set(key, body.Value, body.TTL)

	response := map[string]interface{}{
		"key":     key,
		"value":   body.Value,
		"created": created,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request, key string) {
	deleted := s.Store.Delete(key)

	if !deleted {
		w.WriteHeader(http.StatusNotFound)
		response := map[string]interface{}{
			"error": "key not found",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	response := map[string]interface{}{
		"deleted": true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// HandleBatch handles POST /kv/batch
func (s *Server) HandleBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Operations []map[string]interface{} `json:"operations"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	results := make([]map[string]interface{}, 0, len(body.Operations))

	for _, op := range body.Operations {
		opType, ok := op["op"].(string)
		if !ok {
			w.WriteHeader(http.StatusBadRequest)
			response := map[string]interface{}{
				"error": "invalid operation type",
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
			return
		}

		key, ok := op["key"].(string)
		if !ok {
			w.WriteHeader(http.StatusBadRequest)
			response := map[string]interface{}{
				"error": "key is required",
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
			return
		}

		switch opType {
		case "set":
			value := op["value"]
			var ttl *int
			if ttlFloat, ok := op["ttl"].(float64); ok {
				ttlInt := int(ttlFloat)
				ttl = &ttlInt
			}
			created := s.Store.Set(key, value, ttl)
			results = append(results, map[string]interface{}{
				"key":     key,
				"value":   value,
				"created": created,
			})

		case "get":
			value, exists := s.Store.Get(key)
			if exists {
				results = append(results, map[string]interface{}{
					"key":   key,
					"value": value,
				})
			} else {
				results = append(results, map[string]interface{}{
					"error": "key not found",
				})
			}

		case "delete":
			deleted := s.Store.Delete(key)
			if deleted {
				results = append(results, map[string]interface{}{
					"deleted": true,
				})
			} else {
				results = append(results, map[string]interface{}{
					"error": "key not found",
				})
			}

		default:
			w.WriteHeader(http.StatusBadRequest)
			response := map[string]interface{}{
				"error": "invalid operation: " + opType,
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
			return
		}
	}

	response := map[string]interface{}{
		"success": true,
		"results": results,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
