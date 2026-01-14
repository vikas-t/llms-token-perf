package main

import (
	"context"
	"flag"
	"fmt"
	"kvstore/server"
	"kvstore/store"
	"kvstore/wal"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// Parse command-line flags
	port := flag.Int("port", 8080, "HTTP server port")
	dataDir := flag.String("data-dir", "./data", "Data directory for WAL")
	flag.Parse()

	// Override with environment variables if set
	if envPort := os.Getenv("PORT"); envPort != "" {
		fmt.Sscanf(envPort, "%d", port)
	}
	if envDataDir := os.Getenv("DATA_DIR"); envDataDir != "" {
		*dataDir = envDataDir
	}

	// Initialize WAL
	walInstance, err := wal.New(*dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize WAL: %v", err)
	}
	defer walInstance.Close()

	// Initialize store
	kvStore := store.New()

	// Set up WAL callback
	kvStore.SetWriteCallback(func(op string, key string, value interface{}, ttl *int) {
		if err := walInstance.Append(op, key, value, ttl); err != nil {
			log.Printf("Failed to write to WAL: %v", err)
		}
	})

	// Replay WAL to restore state
	entries, err := walInstance.Replay()
	if err != nil {
		log.Fatalf("Failed to replay WAL: %v", err)
	}

	// Temporarily disable WAL callback during replay
	kvStore.SetWriteCallback(nil)

	log.Printf("Replaying %d entries from WAL", len(entries))
	for _, entry := range entries {
		switch entry.Op {
		case "set":
			// Calculate remaining TTL if present
			var ttl *int
			if entry.TTL != nil {
				elapsed := time.Now().Unix() - entry.Timestamp
				remaining := *entry.TTL - int(elapsed)
				if remaining > 0 {
					ttl = &remaining
				} else {
					// Key already expired, skip
					continue
				}
			}
			kvStore.Set(entry.Key, entry.Value, ttl)
		case "delete":
			kvStore.Delete(entry.Key)
		}
	}

	// Re-enable WAL callback after replay
	kvStore.SetWriteCallback(func(op string, key string, value interface{}, ttl *int) {
		if err := walInstance.Append(op, key, value, ttl); err != nil {
			log.Printf("Failed to write to WAL: %v", err)
		}
	})

	// Start TTL cleanup goroutine
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go kvStore.StartTTLCleanup(ctx, 1*time.Second)

	// Set up HTTP server
	srv := &server.Server{Store: kvStore}

	http.HandleFunc("/stats", srv.HandleStats)
	http.HandleFunc("/kv/batch", srv.HandleBatch)
	http.HandleFunc("/kv/", srv.HandleKey)
	http.HandleFunc("/kv", srv.HandleListKeys)

	// Start server
	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Starting KVStore server on %s", addr)
	log.Printf("Data directory: %s", *dataDir)

	// Handle graceful shutdown
	httpServer := &http.Server{Addr: addr}
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server...")
		cancel()
		httpServer.Shutdown(context.Background())
	}()

	if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
}
