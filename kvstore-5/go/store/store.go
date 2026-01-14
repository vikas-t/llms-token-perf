package store

import (
	"sync"
	"time"
)

// KVStore provides thread-safe key-value storage with TTL support
type KVStore struct {
	mu         sync.RWMutex
	data       map[string]interface{}
	ttls       map[string]time.Time
	onWrite    func(op string, key string, value interface{}, ttl *int)
	operations int64
	startTime  time.Time
}

// New creates a new KVStore instance
func New() *KVStore {
	return &KVStore{
		data:      make(map[string]interface{}),
		ttls:      make(map[string]time.Time),
		startTime: time.Now(),
	}
}

// SetWriteCallback sets a callback to be invoked on write operations (for WAL)
func (s *KVStore) SetWriteCallback(callback func(op string, key string, value interface{}, ttl *int)) {
	s.onWrite = callback
}

// Get retrieves a value by key, returns nil if not found or expired
func (s *KVStore) Get(key string) (interface{}, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.operations++

	// Check if key exists
	value, exists := s.data[key]
	if !exists {
		return nil, false
	}

	// Check if expired
	if s.isExpiredUnsafe(key) {
		return nil, false
	}

	return value, true
}

// Set stores a value with optional TTL (in seconds)
func (s *KVStore) Set(key string, value interface{}, ttl *int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.operations++

	// Check if key already exists
	_, existed := s.data[key]

	// Store value
	s.data[key] = value

	// Handle TTL
	if ttl != nil {
		if *ttl <= 0 {
			// Immediate expiry
			s.ttls[key] = time.Now()
		} else {
			s.ttls[key] = time.Now().Add(time.Duration(*ttl) * time.Second)
		}
	} else {
		// Remove TTL if present
		delete(s.ttls, key)
	}

	// Notify WAL
	if s.onWrite != nil {
		s.onWrite("set", key, value, ttl)
	}

	return !existed // true if created, false if updated
}

// Delete removes a key
func (s *KVStore) Delete(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.operations++

	// Check if exists and not expired
	if _, exists := s.data[key]; !exists {
		return false
	}
	if s.isExpiredUnsafe(key) {
		return false
	}

	delete(s.data, key)
	delete(s.ttls, key)

	// Notify WAL
	if s.onWrite != nil {
		s.onWrite("delete", key, nil, nil)
	}

	return true
}

// List returns all non-expired keys, optionally filtered by prefix
func (s *KVStore) List(prefix string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	keys := make([]string, 0)
	for key := range s.data {
		// Skip expired keys
		if s.isExpiredUnsafe(key) {
			continue
		}

		// Filter by prefix if provided
		if prefix == "" || startsWithPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}

	return keys
}

// Stats returns store statistics (total_keys, total_operations, uptime_seconds)
func (s *KVStore) Stats() (int, int64, float64) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	count := 0

	for key := range s.data {
		// Skip expired keys
		if s.isExpiredUnsafe(key) {
			continue
		}

		count++
	}

	uptime := time.Since(s.startTime).Seconds()

	return count, s.operations, uptime
}

// CleanupExpired removes all expired keys (called periodically)
func (s *KVStore) CleanupExpired() {
	s.mu.Lock()
	defer s.mu.Unlock()

	toDelete := make([]string, 0)
	for key := range s.data {
		if s.isExpiredUnsafe(key) {
			toDelete = append(toDelete, key)
		}
	}

	for _, key := range toDelete {
		delete(s.data, key)
		delete(s.ttls, key)
	}
}

// isExpired checks if a key is expired (requires read lock)
func (s *KVStore) isExpired(key string) bool {
	expiry, hasTTL := s.ttls[key]
	if !hasTTL {
		return false
	}
	return time.Now().After(expiry)
}

// isExpiredUnsafe checks if a key is expired (without acquiring lock)
func (s *KVStore) isExpiredUnsafe(key string) bool {
	expiry, hasTTL := s.ttls[key]
	if !hasTTL {
		return false
	}
	return time.Now().After(expiry)
}

// startsWithPrefix checks if a string starts with a prefix
func startsWithPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
