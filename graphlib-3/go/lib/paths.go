package graphlib

import (
	"container/heap"
	"math"
	"sort"
)

// PriorityQueueItem represents an item in the priority queue
type PriorityQueueItem struct {
	node     string
	distance float64
	index    int
}

// PriorityQueue implements heap.Interface
type PriorityQueue []*PriorityQueueItem

func (pq PriorityQueue) Len() int { return len(pq) }

func (pq PriorityQueue) Less(i, j int) bool {
	return pq[i].distance < pq[j].distance
}

func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}

func (pq *PriorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*PriorityQueueItem)
	item.index = n
	*pq = append(*pq, item)
}

func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

// ShortestPath finds the shortest path between two nodes
func ShortestPath(graphID, startNode, endNode string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{
			"exists":   false,
			"path":     []string{},
			"distance": -1.0,
		}
	}

	if !g.Nodes[startNode] || !g.Nodes[endNode] {
		return map[string]interface{}{
			"exists":   false,
			"path":     []string{},
			"distance": -1.0,
		}
	}

	// Same node
	if startNode == endNode {
		return map[string]interface{}{
			"exists":   true,
			"path":     []string{startNode},
			"distance": 0.0,
		}
	}

	// Use BFS for unweighted graphs, Dijkstra for weighted
	if !g.Weighted {
		return bfsShortestPath(g, startNode, endNode)
	}
	return dijkstraShortestPath(g, startNode, endNode)
}

func bfsShortestPath(g *Graph, startNode, endNode string) map[string]interface{} {
	parent := make(map[string]string)
	visited := make(map[string]bool)

	queue := []string{startNode}
	visited[startNode] = true

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		if node == endNode {
			// Reconstruct path
			path := []string{}
			current := endNode
			for current != "" {
				path = append([]string{current}, path...)
				current = parent[current]
			}
			return map[string]interface{}{
				"exists":   true,
				"path":     path,
				"distance": float64(len(path) - 1),
			}
		}

		// Get sorted neighbors for deterministic order
		neighbors := make([]string, 0, len(g.Adj[node]))
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

	return map[string]interface{}{
		"exists":   false,
		"path":     []string{},
		"distance": -1.0,
	}
}

func dijkstraShortestPath(g *Graph, startNode, endNode string) map[string]interface{} {
	dist := make(map[string]float64)
	parent := make(map[string]string)

	for node := range g.Nodes {
		dist[node] = math.Inf(1)
	}
	dist[startNode] = 0

	pq := &PriorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &PriorityQueueItem{node: startNode, distance: 0})

	visited := make(map[string]bool)

	for pq.Len() > 0 {
		item := heap.Pop(pq).(*PriorityQueueItem)
		node := item.node

		if visited[node] {
			continue
		}
		visited[node] = true

		if node == endNode {
			// Reconstruct path
			path := []string{}
			current := endNode
			for current != "" {
				path = append([]string{current}, path...)
				current = parent[current]
			}
			return map[string]interface{}{
				"exists":   true,
				"path":     path,
				"distance": dist[endNode],
			}
		}

		for neighbor, weight := range g.Adj[node] {
			if !visited[neighbor] {
				newDist := dist[node] + weight
				if newDist < dist[neighbor] {
					dist[neighbor] = newDist
					parent[neighbor] = node
					heap.Push(pq, &PriorityQueueItem{node: neighbor, distance: newDist})
				}
			}
		}
	}

	return map[string]interface{}{
		"exists":   false,
		"path":     []string{},
		"distance": -1.0,
	}
}

// AllShortestPaths finds shortest paths from start node to all other nodes
func AllShortestPaths(graphID, startNode string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{
			"distances":   map[string]float64{},
			"paths":       map[string][]string{},
			"unreachable": []string{},
		}
	}

	if !g.Nodes[startNode] {
		return map[string]interface{}{
			"distances":   map[string]float64{},
			"paths":       map[string][]string{},
			"unreachable": []string{},
		}
	}

	dist := make(map[string]float64)
	parent := make(map[string]string)

	for node := range g.Nodes {
		dist[node] = math.Inf(1)
	}
	dist[startNode] = 0

	pq := &PriorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &PriorityQueueItem{node: startNode, distance: 0})

	visited := make(map[string]bool)

	for pq.Len() > 0 {
		item := heap.Pop(pq).(*PriorityQueueItem)
		node := item.node

		if visited[node] {
			continue
		}
		visited[node] = true

		for neighbor, weight := range g.Adj[node] {
			w := weight
			if !g.Weighted {
				w = 1.0
			}
			if !visited[neighbor] {
				newDist := dist[node] + w
				if newDist < dist[neighbor] {
					dist[neighbor] = newDist
					parent[neighbor] = node
					heap.Push(pq, &PriorityQueueItem{node: neighbor, distance: newDist})
				}
			}
		}
	}

	// Build result
	distances := make(map[string]float64)
	paths := make(map[string][]string)
	unreachable := []string{}

	for node := range g.Nodes {
		if math.IsInf(dist[node], 1) {
			unreachable = append(unreachable, node)
		} else {
			distances[node] = dist[node]
			// Reconstruct path
			path := []string{}
			current := node
			for current != "" {
				path = append([]string{current}, path...)
				current = parent[current]
			}
			paths[node] = path
		}
	}

	sort.Strings(unreachable)

	return map[string]interface{}{
		"distances":   distances,
		"paths":       paths,
		"unreachable": unreachable,
	}
}

// HasPath checks if a path exists between two nodes
func HasPath(graphID, startNode, endNode string) map[string]interface{} {
	g, ok := Store.GetGraph(graphID)
	if !ok {
		return map[string]interface{}{"exists": false}
	}

	if !g.Nodes[startNode] || !g.Nodes[endNode] {
		return map[string]interface{}{"exists": false}
	}

	// Same node
	if startNode == endNode {
		return map[string]interface{}{"exists": true}
	}

	// BFS to check reachability
	visited := make(map[string]bool)
	queue := []string{startNode}
	visited[startNode] = true

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		for neighbor := range g.Adj[node] {
			if neighbor == endNode {
				return map[string]interface{}{"exists": true}
			}
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
			}
		}
	}

	return map[string]interface{}{"exists": false}
}
