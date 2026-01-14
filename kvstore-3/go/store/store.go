package store

import (
	"encoding/json"
	"sync"
	"time"
)

// Item represents a value stored with optional TTL
type Item struct {
	Value      interface{}
	ExpiresAt  *time.Time
}

// KVStore is a thread-safe in-memory key-value store
type KVStore struct {
	mu    sync.RWMutex
	data  map[string]*Item
}

// NewKVStore creates a new KVStore instance
func NewKVStore() *KVStore {
	return &KVStore{
		data: make(map[string]*Item),
	}
}

// Get retrieves a value by key, checking expiration
func (s *KVStore) Get(key string) (interface{}, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	item, exists := s.data[key]
	if !exists {
		return nil, false
	}

	// Check if expired
	if item.ExpiresAt != nil && time.Now().After(*item.ExpiresAt) {
		return nil, false
	}

	return item.Value, true
}

// Set stores a value with optional TTL
func (s *KVStore) Set(key string, value interface{}, ttl *int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var expiresAt *time.Time
	if ttl != nil && *ttl > 0 {
		expiry := time.Now().Add(time.Duration(*ttl) * time.Second)
		expiresAt = &expiry
	}

	s.data[key] = &Item{
		Value:     value,
		ExpiresAt: expiresAt,
	}
}

// Delete removes a key from the store
func (s *KVStore) Delete(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if key exists and is not expired
	item, exists := s.data[key]
	if !exists {
		return false
	}

	// Check expiration
	if item.ExpiresAt != nil && time.Now().After(*item.ExpiresAt) {
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

	now := time.Now()
	keys := make([]string, 0)

	for key, item := range s.data {
		// Skip expired keys
		if item.ExpiresAt != nil && now.After(*item.ExpiresAt) {
			continue
		}

		// Apply prefix filter if provided
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

	now := time.Now()
	count := 0
	totalSize := 0

	for _, item := range s.data {
		// Skip expired keys
		if item.ExpiresAt != nil && now.After(*item.ExpiresAt) {
			continue
		}

		count++

		// Calculate size of value
		data, err := json.Marshal(item.Value)
		if err == nil {
			totalSize += len(data)
		}
	}

	return count, totalSize
}

// CleanupExpired removes all expired keys (for background cleanup)
func (s *KVStore) CleanupExpired() int {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	removed := 0

	for key, item := range s.data {
		if item.ExpiresAt != nil && now.After(*item.ExpiresAt) {
			delete(s.data, key)
			removed++
		}
	}

	return removed
}
