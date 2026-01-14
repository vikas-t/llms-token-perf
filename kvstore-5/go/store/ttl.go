package store

import (
	"context"
	"time"
)

// StartTTLCleanup starts a background goroutine that periodically cleans up expired keys
func (s *KVStore) StartTTLCleanup(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.CleanupExpired()
		}
	}
}
