package main

import (
	"flag"
	"kvstore/server"
	"kvstore/store"
	"kvstore/wal"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func main() {
	// Parse command-line flags
	port := flag.String("port", getEnv("PORT", "8080"), "HTTP server port")
	dataDir := flag.String("data-dir", getEnv("DATA_DIR", "./data"), "Directory for WAL file")
	flag.Parse()

	// Create data directory if it doesn't exist
	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	// Initialize WAL
	walPath := filepath.Join(*dataDir, "wal.log")
	walInstance, err := wal.NewWAL(walPath)
	if err != nil {
		log.Fatalf("Failed to initialize WAL: %v", err)
	}
	defer walInstance.Close()

	// Initialize store
	kvstore := store.NewKVStore()

	// Replay WAL to restore state
	entries, err := walInstance.Replay()
	if err != nil {
		log.Fatalf("Failed to replay WAL: %v", err)
	}

	log.Printf("Replaying %d WAL entries...", len(entries))
	for _, entry := range entries {
		switch entry.Op {
		case "set":
			kvstore.Set(entry.Key, entry.Value, entry.TTL)
		case "delete":
			kvstore.Delete(entry.Key)
		}
	}

	// Start TTL cleanup goroutine (run every 10 seconds)
	kvstore.StartTTLCleanup(10 * time.Second)

	// Initialize server
	srv := &server.Server{
		Store: kvstore,
		WAL:   walInstance,
	}

	// Register routes
	http.HandleFunc("/stats", srv.HandleStats)
	http.HandleFunc("/kv", srv.HandleListKeys)
	http.HandleFunc("/kv/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			srv.HandleGet(w, r)
		case http.MethodPut:
			srv.HandlePut(w, r)
		case http.MethodDelete:
			srv.HandleDelete(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/kv/batch", srv.HandleBatch)

	// Start server
	addr := ":" + *port
	log.Printf("Starting KVStore server on %s", addr)
	log.Printf("Data directory: %s", *dataDir)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
