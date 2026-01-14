package store

import (
	"time"
)

// StartTTLCleanup starts a background goroutine that periodically cleans up expired keys
func (s *KVStore) StartTTLCleanup(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			s.CleanupExpired()
		}
	}()
}
