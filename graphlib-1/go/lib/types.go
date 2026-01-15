package lib

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Edge struct {
	From   string  `json:"from"`
	To     string  `json:"to"`
	Weight float64 `json:"weight"`
}

type Graph struct {
	ID       string                        `json:"id"`
	Directed bool                          `json:"directed"`
	Weighted bool                          `json:"weighted"`
	Nodes    map[string]bool               `json:"nodes"`
	AdjList  map[string]map[string]float64 `json:"adj_list"`
	InEdges  map[string]map[string]float64 `json:"in_edges"`
}

type GraphStore struct {
	mu       sync.RWMutex
	graphs   map[string]*Graph
	NextID   int
	dataFile string
}

type PersistData struct {
	Graphs map[string]*Graph `json:"graphs"`
	NextID int               `json:"next_id"`
}

func NewGraphStore() *GraphStore {
	store := &GraphStore{graphs: make(map[string]*Graph), NextID: 1}
	store.dataFile = filepath.Join(os.TempDir(), "graphlib_store.json")
	store.Load()
	return store
}

func (s *GraphStore) Save() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	data := PersistData{Graphs: s.graphs, NextID: s.NextID}
	bytes, err := json.Marshal(data)
	if err != nil {
		return err
	}
	return os.WriteFile(s.dataFile, bytes, 0644)
}

func (s *GraphStore) Load() error {
	bytes, err := os.ReadFile(s.dataFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var data PersistData
	if err := json.Unmarshal(bytes, &data); err != nil {
		return err
	}
	s.graphs = data.Graphs
	if s.graphs == nil {
		s.graphs = make(map[string]*Graph)
	}
	s.NextID = data.NextID
	if s.NextID < 1 {
		s.NextID = 1
	}
	return nil
}

var Store = NewGraphStore()
