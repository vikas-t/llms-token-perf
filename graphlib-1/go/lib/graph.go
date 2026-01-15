package lib

import (
	"fmt"
	"sort"
)

func (s *GraphStore) CreateGraph(directed, weighted bool) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := fmt.Sprintf("graph-%d", s.NextID)
	s.NextID++
	g := &Graph{ID: id, Directed: directed, Weighted: weighted, Nodes: make(map[string]bool), AdjList: make(map[string]map[string]float64), InEdges: make(map[string]map[string]float64)}
	s.graphs[id] = g
	return map[string]interface{}{"id": id, "directed": directed, "weighted": weighted, "node_count": 0, "edge_count": 0}
}

func (s *GraphStore) GetGraph(id string) *Graph {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.graphs[id]
}

func (s *GraphStore) AddNode(graphID, nodeID string) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	if g.Nodes[nodeID] {
		return map[string]interface{}{"success": false, "error": "node_already_exists"}
	}
	g.Nodes[nodeID] = true
	if g.AdjList[nodeID] == nil {
		g.AdjList[nodeID] = make(map[string]float64)
	}
	if g.InEdges[nodeID] == nil {
		g.InEdges[nodeID] = make(map[string]float64)
	}
	return map[string]interface{}{"success": true, "node_id": nodeID}
}

func (s *GraphStore) AddEdge(graphID, from, to string, weight float64) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	if !g.Nodes[from] {
		g.Nodes[from] = true
		g.AdjList[from] = make(map[string]float64)
		g.InEdges[from] = make(map[string]float64)
	}
	if !g.Nodes[to] {
		g.Nodes[to] = true
		g.AdjList[to] = make(map[string]float64)
		g.InEdges[to] = make(map[string]float64)
	}
	if _, exists := g.AdjList[from][to]; exists {
		return map[string]interface{}{"success": false, "error": "edge_already_exists"}
	}
	if !g.Directed {
		if _, exists := g.AdjList[to][from]; exists {
			return map[string]interface{}{"success": false, "error": "edge_already_exists"}
		}
	}
	g.AdjList[from][to] = weight
	g.InEdges[to][from] = weight
	if !g.Directed {
		g.AdjList[to][from] = weight
		g.InEdges[from][to] = weight
	}
	return map[string]interface{}{"success": true, "from": from, "to": to, "weight": weight}
}

func (s *GraphStore) RemoveNode(graphID, nodeID string) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	if !g.Nodes[nodeID] {
		return map[string]interface{}{"success": false, "error": "node_not_found"}
	}
	removedEdges := 0
	if adj, ok := g.AdjList[nodeID]; ok {
		for to := range adj {
			if to != nodeID {
				delete(g.InEdges[to], nodeID)
			}
			removedEdges++
		}
	}
	if g.Directed {
		if in, ok := g.InEdges[nodeID]; ok {
			for from := range in {
				if from != nodeID {
					delete(g.AdjList[from], nodeID)
					removedEdges++
				}
			}
		}
	} else {
		for node := range g.Nodes {
			if node != nodeID {
				delete(g.AdjList[node], nodeID)
				delete(g.InEdges[node], nodeID)
			}
		}
	}
	delete(g.Nodes, nodeID)
	delete(g.AdjList, nodeID)
	delete(g.InEdges, nodeID)
	return map[string]interface{}{"success": true, "removed_edges": removedEdges}
}

func (s *GraphStore) RemoveEdge(graphID, from, to string) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	if _, exists := g.AdjList[from][to]; !exists {
		return map[string]interface{}{"success": false, "error": "edge_not_found"}
	}
	delete(g.AdjList[from], to)
	delete(g.InEdges[to], from)
	if !g.Directed {
		delete(g.AdjList[to], from)
		delete(g.InEdges[from], to)
	}
	return map[string]interface{}{"success": true}
}

func (s *GraphStore) GetNodes(graphID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"nodes": []string{}, "count": 0}
	}
	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)
	return map[string]interface{}{"nodes": nodes, "count": len(nodes)}
}

func (s *GraphStore) GetEdges(graphID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"edges": []Edge{}, "count": 0}
	}
	edges := []Edge{}
	seen := make(map[string]bool)
	nodes := make([]string, 0, len(g.Nodes))
	for node := range g.Nodes {
		nodes = append(nodes, node)
	}
	sort.Strings(nodes)
	for _, from := range nodes {
		adj := g.AdjList[from]
		neighbors := make([]string, 0, len(adj))
		for to := range adj {
			neighbors = append(neighbors, to)
		}
		sort.Strings(neighbors)
		for _, to := range neighbors {
			weight := adj[to]
			var key string
			if g.Directed {
				key = from + "->" + to
			} else {
				if from < to {
					key = from + "-" + to
				} else {
					key = to + "-" + from
				}
			}
			if !seen[key] {
				seen[key] = true
				edges = append(edges, Edge{From: from, To: to, Weight: weight})
			}
		}
	}
	return map[string]interface{}{"edges": edges, "count": len(edges)}
}

func (s *GraphStore) GetNeighbors(graphID, nodeID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"neighbors": []string{}, "count": 0}
	}
	neighbors := []string{}
	if adj, ok := g.AdjList[nodeID]; ok {
		for to := range adj {
			neighbors = append(neighbors, to)
		}
	}
	sort.Strings(neighbors)
	return map[string]interface{}{"neighbors": neighbors, "count": len(neighbors)}
}

func (s *GraphStore) HasNode(graphID, nodeID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"exists": false}
	}
	return map[string]interface{}{"exists": g.Nodes[nodeID]}
}

func (s *GraphStore) HasEdge(graphID, from, to string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"exists": false}
	}
	if weight, exists := g.AdjList[from][to]; exists {
		return map[string]interface{}{"exists": true, "weight": weight}
	}
	return map[string]interface{}{"exists": false}
}

func (s *GraphStore) GetDegree(graphID, nodeID string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"degree": 0, "in_degree": 0, "out_degree": 0}
	}
	outDegree := len(g.AdjList[nodeID])
	inDegree := len(g.InEdges[nodeID])
	if g.Directed {
		return map[string]interface{}{"degree": outDegree + inDegree, "in_degree": inDegree, "out_degree": outDegree}
	}
	return map[string]interface{}{"degree": outDegree, "in_degree": outDegree, "out_degree": outDegree}
}

func (s *GraphStore) GetGraphInfo(graphID string) map[string]interface{} {
	s.mu.RLock()
	g, ok := s.graphs[graphID]
	if !ok {
		s.mu.RUnlock()
		return map[string]interface{}{"error": "graph_not_found"}
	}
	nodeCount := len(g.Nodes)
	edgeCount := 0
	seen := make(map[string]bool)
	for from, adj := range g.AdjList {
		for to := range adj {
			var key string
			if g.Directed {
				key = from + "->" + to
			} else {
				if from < to {
					key = from + "-" + to
				} else {
					key = to + "-" + from
				}
			}
			if !seen[key] {
				seen[key] = true
				edgeCount++
			}
		}
	}
	id, directed, weighted := g.ID, g.Directed, g.Weighted
	s.mu.RUnlock()
	isConnected := s.IsConnected(graphID)["is_connected"].(bool)
	hasCycle := s.HasCycle(graphID)["has_cycle"].(bool)
	return map[string]interface{}{"id": id, "directed": directed, "weighted": weighted, "node_count": nodeCount, "edge_count": edgeCount, "is_connected": isConnected, "has_cycle": hasCycle}
}

func (s *GraphStore) ClearGraph(graphID string) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	g.Nodes = make(map[string]bool)
	g.AdjList = make(map[string]map[string]float64)
	g.InEdges = make(map[string]map[string]float64)
	return map[string]interface{}{"success": true}
}

func (s *GraphStore) CloneGraph(graphID string) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"error": "graph_not_found"}
	}
	newID := fmt.Sprintf("graph-%d", s.NextID)
	s.NextID++
	newGraph := &Graph{ID: newID, Directed: g.Directed, Weighted: g.Weighted, Nodes: make(map[string]bool), AdjList: make(map[string]map[string]float64), InEdges: make(map[string]map[string]float64)}
	for node := range g.Nodes {
		newGraph.Nodes[node] = true
	}
	for from, adj := range g.AdjList {
		newGraph.AdjList[from] = make(map[string]float64)
		for to, weight := range adj {
			newGraph.AdjList[from][to] = weight
		}
	}
	for to, in := range g.InEdges {
		newGraph.InEdges[to] = make(map[string]float64)
		for from, weight := range in {
			newGraph.InEdges[to][from] = weight
		}
	}
	s.graphs[newID] = newGraph
	edgeCount := 0
	seen := make(map[string]bool)
	for from, adj := range newGraph.AdjList {
		for to := range adj {
			var key string
			if newGraph.Directed {
				key = from + "->" + to
			} else {
				if from < to {
					key = from + "-" + to
				} else {
					key = to + "-" + from
				}
			}
			if !seen[key] {
				seen[key] = true
				edgeCount++
			}
		}
	}
	return map[string]interface{}{"id": newID, "directed": newGraph.Directed, "weighted": newGraph.Weighted, "node_count": len(newGraph.Nodes), "edge_count": edgeCount}
}

func (s *GraphStore) Subgraph(graphID string, nodes []string) map[string]interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"error": "graph_not_found"}
	}
	newID := fmt.Sprintf("graph-%d", s.NextID)
	s.NextID++
	nodeSet := make(map[string]bool)
	for _, n := range nodes {
		if g.Nodes[n] {
			nodeSet[n] = true
		}
	}
	newGraph := &Graph{ID: newID, Directed: g.Directed, Weighted: g.Weighted, Nodes: make(map[string]bool), AdjList: make(map[string]map[string]float64), InEdges: make(map[string]map[string]float64)}
	for node := range nodeSet {
		newGraph.Nodes[node] = true
		newGraph.AdjList[node] = make(map[string]float64)
		newGraph.InEdges[node] = make(map[string]float64)
	}
	for from := range nodeSet {
		if adj, ok := g.AdjList[from]; ok {
			for to, weight := range adj {
				if nodeSet[to] {
					newGraph.AdjList[from][to] = weight
					newGraph.InEdges[to][from] = weight
				}
			}
		}
	}
	s.graphs[newID] = newGraph
	edgeCount := 0
	seen := make(map[string]bool)
	for from, adj := range newGraph.AdjList {
		for to := range adj {
			var key string
			if newGraph.Directed {
				key = from + "->" + to
			} else {
				if from < to {
					key = from + "-" + to
				} else {
					key = to + "-" + from
				}
			}
			if !seen[key] {
				seen[key] = true
				edgeCount++
			}
		}
	}
	return map[string]interface{}{"id": newID, "directed": newGraph.Directed, "weighted": newGraph.Weighted, "node_count": len(newGraph.Nodes), "edge_count": edgeCount}
}
