package store

import (
	"encoding/json"
	"sync"
	"time"
)

// Entry represents a value with optional TTL
type Entry struct {
	Value      interface{}
	ExpiresAt  *time.Time
}

// KVStore is a thread-safe in-memory key-value store
type KVStore struct {
	mu    sync.RWMutex
	data  map[string]*Entry
}

// NewKVStore creates a new KVStore instance
func NewKVStore() *KVStore {
	return &KVStore{
		data: make(map[string]*Entry),
	}
}

// Get retrieves a value by key, returns nil if not found or expired
func (s *KVStore) Get(key string) (interface{}, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entry, exists := s.data[key]
	if !exists {
		return nil, false
	}

	// Check if expired
	if entry.ExpiresAt != nil && time.Now().After(*entry.ExpiresAt) {
		return nil, false
	}

	return entry.Value, true
}

// Set stores a key-value pair with optional TTL
func (s *KVStore) Set(key string, value interface{}, ttl *int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry := &Entry{
		Value: value,
	}

	if ttl != nil && *ttl > 0 {
		expiresAt := time.Now().Add(time.Duration(*ttl) * time.Second)
		entry.ExpiresAt = &expiresAt
	}

	s.data[key] = entry
}

// Delete removes a key from the store
func (s *KVStore) Delete(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if key exists and not expired
	entry, exists := s.data[key]
	if !exists {
		return false
	}

	if entry.ExpiresAt != nil && time.Now().After(*entry.ExpiresAt) {
		delete(s.data, key)
		return false
	}

	delete(s.data, key)
	return true
}

// ListKeys returns all non-expired keys, optionally filtered by prefix
func (s *KVStore) ListKeys(prefix string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	keys := make([]string, 0)
	now := time.Now()

	for key, entry := range s.data {
		// Skip expired keys
		if entry.ExpiresAt != nil && now.After(*entry.ExpiresAt) {
			continue
		}

		// Filter by prefix if provided
		if prefix == "" || len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			keys = append(keys, key)
		}
	}

	return keys
}

// Stats returns statistics about the store
func (s *KVStore) Stats() (int, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0
	totalSize := 0
	now := time.Now()

	for _, entry := range s.data {
		// Skip expired keys
		if entry.ExpiresAt != nil && now.After(*entry.ExpiresAt) {
			continue
		}

		count++

		// Calculate size of the value
		valueBytes, err := json.Marshal(entry.Value)
		if err == nil {
			totalSize += len(valueBytes)
		}
	}

	return count, totalSize
}

// CleanupExpired removes expired entries from the store
func (s *KVStore) CleanupExpired() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	for key, entry := range s.data {
		if entry.ExpiresAt != nil && now.After(*entry.ExpiresAt) {
			delete(s.data, key)
		}
	}
}
