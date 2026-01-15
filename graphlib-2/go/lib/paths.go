package lib

import (
	"container/heap"
	"math"
	"sort"
)

// ShortestPathResult contains the result of finding a shortest path
type ShortestPathResult struct {
	Exists   bool     `json:"exists"`
	Path     []string `json:"path"`
	Distance float64  `json:"distance"`
}

// AllShortestPathsResult contains results of finding all shortest paths from a source
type AllShortestPathsResult struct {
	Distances   map[string]float64  `json:"distances"`
	Paths       map[string][]string `json:"paths"`
	Unreachable []string            `json:"unreachable"`
}

// Priority queue implementation for Dijkstra
type pqItem struct {
	node     string
	distance float64
	index    int
}

type priorityQueue []*pqItem

func (pq priorityQueue) Len() int { return len(pq) }

func (pq priorityQueue) Less(i, j int) bool {
	return pq[i].distance < pq[j].distance
}

func (pq priorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}

func (pq *priorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*pqItem)
	item.index = n
	*pq = append(*pq, item)
}

func (pq *priorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

// ShortestPath finds the shortest path between two nodes
func (g *Graph) ShortestPath(start, end string) *ShortestPathResult {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if !g.Nodes[start] || !g.Nodes[end] {
		return &ShortestPathResult{Exists: false, Path: []string{}, Distance: -1}
	}

	if start == end {
		return &ShortestPathResult{Exists: true, Path: []string{start}, Distance: 0}
	}

	// Use BFS for unweighted graphs (or weighted with all weights = 1)
	if !g.Weighted {
		return g.shortestPathBFS(start, end)
	}

	// Use Dijkstra for weighted graphs
	return g.shortestPathDijkstra(start, end)
}

func (g *Graph) shortestPathBFS(start, end string) *ShortestPathResult {
	visited := make(map[string]bool)
	parent := make(map[string]string)
	queue := []string{start}
	visited[start] = true

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		if node == end {
			// Reconstruct path
			path := []string{}
			current := end
			for current != "" {
				path = append([]string{current}, path...)
				current = parent[current]
			}
			return &ShortestPathResult{
				Exists:   true,
				Path:     path,
				Distance: float64(len(path) - 1),
			}
		}

		// Get neighbors in sorted order
		neighbors := make([]string, 0)
		for neighbor := range g.Adj[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)

		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				visited[neighbor] = true
				parent[neighbor] = node
				queue = append(queue, neighbor)
			}
		}
	}

	return &ShortestPathResult{Exists: false, Path: []string{}, Distance: -1}
}

func (g *Graph) shortestPathDijkstra(start, end string) *ShortestPathResult {
	dist := make(map[string]float64)
	parent := make(map[string]string)

	for node := range g.Nodes {
		dist[node] = math.Inf(1)
	}
	dist[start] = 0

	pq := make(priorityQueue, 0)
	heap.Init(&pq)
	heap.Push(&pq, &pqItem{node: start, distance: 0})

	visited := make(map[string]bool)

	for pq.Len() > 0 {
		item := heap.Pop(&pq).(*pqItem)
		node := item.node

		if visited[node] {
			continue
		}
		visited[node] = true

		if node == end {
			// Reconstruct path
			path := []string{}
			current := end
			for current != "" {
				path = append([]string{current}, path...)
				current = parent[current]
			}
			return &ShortestPathResult{
				Exists:   true,
				Path:     path,
				Distance: dist[end],
			}
		}

		for neighbor, weight := range g.Adj[node] {
			if !visited[neighbor] {
				newDist := dist[node] + weight
				if newDist < dist[neighbor] {
					dist[neighbor] = newDist
					parent[neighbor] = node
					heap.Push(&pq, &pqItem{node: neighbor, distance: newDist})
				}
			}
		}
	}

	return &ShortestPathResult{Exists: false, Path: []string{}, Distance: -1}
}

// AllShortestPaths finds shortest paths from start to all reachable nodes
func (g *Graph) AllShortestPaths(start string) *AllShortestPathsResult {
	g.mu.RLock()
	defer g.mu.RUnlock()

	result := &AllShortestPathsResult{
		Distances:   make(map[string]float64),
		Paths:       make(map[string][]string),
		Unreachable: make([]string, 0),
	}

	if !g.Nodes[start] {
		for node := range g.Nodes {
			result.Unreachable = append(result.Unreachable, node)
		}
		sort.Strings(result.Unreachable)
		return result
	}

	dist := make(map[string]float64)
	parent := make(map[string]string)

	for node := range g.Nodes {
		dist[node] = math.Inf(1)
	}
	dist[start] = 0

	if !g.Weighted {
		// BFS for unweighted
		visited := make(map[string]bool)
		queue := []string{start}
		visited[start] = true

		for len(queue) > 0 {
			node := queue[0]
			queue = queue[1:]

			neighbors := make([]string, 0)
			for neighbor := range g.Adj[node] {
				neighbors = append(neighbors, neighbor)
			}
			sort.Strings(neighbors)

			for _, neighbor := range neighbors {
				if !visited[neighbor] {
					visited[neighbor] = true
					dist[neighbor] = dist[node] + 1
					parent[neighbor] = node
					queue = append(queue, neighbor)
				}
			}
		}
	} else {
		// Dijkstra for weighted
		pq := make(priorityQueue, 0)
		heap.Init(&pq)
		heap.Push(&pq, &pqItem{node: start, distance: 0})

		visited := make(map[string]bool)

		for pq.Len() > 0 {
			item := heap.Pop(&pq).(*pqItem)
			node := item.node

			if visited[node] {
				continue
			}
			visited[node] = true

			for neighbor, weight := range g.Adj[node] {
				if !visited[neighbor] {
					newDist := dist[node] + weight
					if newDist < dist[neighbor] {
						dist[neighbor] = newDist
						parent[neighbor] = node
						heap.Push(&pq, &pqItem{node: neighbor, distance: newDist})
					}
				}
			}
		}
	}

	// Build result
	for node := range g.Nodes {
		if math.IsInf(dist[node], 1) {
			result.Unreachable = append(result.Unreachable, node)
		} else {
			result.Distances[node] = dist[node]
			// Reconstruct path
			path := []string{}
			current := node
			for current != "" {
				path = append([]string{current}, path...)
				current = parent[current]
			}
			result.Paths[node] = path
		}
	}

	sort.Strings(result.Unreachable)
	return result
}

// HasPath checks if a path exists between two nodes
func (g *Graph) HasPath(start, end string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if !g.Nodes[start] || !g.Nodes[end] {
		return false
	}

	if start == end {
		return true
	}

	// Simple BFS to check connectivity
	visited := make(map[string]bool)
	queue := []string{start}
	visited[start] = true

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		for neighbor := range g.Adj[node] {
			if neighbor == end {
				return true
			}
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
			}
		}
	}

	return false
}
