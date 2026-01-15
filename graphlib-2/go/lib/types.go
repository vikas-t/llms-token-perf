package lib

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"sync"
)

// Edge represents an edge in the graph
type Edge struct {
	From   string  `json:"from"`
	To     string  `json:"to"`
	Weight float64 `json:"weight"`
}

// Graph represents a graph data structure using adjacency lists
type Graph struct {
	ID       string                         `json:"id"`
	Directed bool                           `json:"directed"`
	Weighted bool                           `json:"weighted"`
	Nodes    map[string]bool                `json:"nodes"`
	Adj      map[string]map[string]float64  `json:"adj"`
	InEdges  map[string]map[string]float64  `json:"in_edges"`
	mu       sync.RWMutex
}

// GraphStore manages multiple graphs with file persistence
type GraphStore struct {
	dataDir string
	mu      sync.RWMutex
}

var store *GraphStore

func init() {
	dataDir := filepath.Join(os.TempDir(), "graphlib_data")
	os.MkdirAll(dataDir, 0755)
	store = &GraphStore{dataDir: dataDir}
}

// GetStore returns the global graph store
func GetStore() *GraphStore {
	return store
}

func (s *GraphStore) graphFile(id string) string {
	return filepath.Join(s.dataDir, id+".json")
}

func (s *GraphStore) counterFile() string {
	return filepath.Join(s.dataDir, "_counter.txt")
}

// Get retrieves a graph by ID
func (s *GraphStore) Get(id string) *Graph {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(s.graphFile(id))
	if err != nil {
		return nil
	}

	g := &Graph{}
	if err := json.Unmarshal(data, g); err != nil {
		return nil
	}
	return g
}

// Save stores a graph to disk
func (s *GraphStore) Save(g *Graph) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.Marshal(g)
	if err != nil {
		return err
	}
	return os.WriteFile(s.graphFile(g.ID), data, 0644)
}

// Delete removes a graph from disk
func (s *GraphStore) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	os.Remove(s.graphFile(id))
}

// GenerateID creates a unique graph ID
func GenerateID() string {
	store.mu.Lock()
	defer store.mu.Unlock()

	counter := uint64(1)
	data, err := os.ReadFile(store.counterFile())
	if err == nil {
		if n, err := strconv.ParseUint(string(data), 10, 64); err == nil {
			counter = n + 1
		}
	}

	os.WriteFile(store.counterFile(), []byte(strconv.FormatUint(counter, 10)), 0644)
	return "graph-" + strconv.FormatUint(counter, 10)
}
