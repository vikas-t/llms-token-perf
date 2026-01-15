package lib

import (
	"container/heap"
	"math"
	"sort"
)

type pqItem struct {
	node     string
	priority float64
	index    int
}

type priorityQueue []*pqItem

func (pq priorityQueue) Len() int            { return len(pq) }
func (pq priorityQueue) Less(i, j int) bool  { return pq[i].priority < pq[j].priority }
func (pq priorityQueue) Swap(i, j int)       { pq[i], pq[j] = pq[j], pq[i]; pq[i].index = i; pq[j].index = j }
func (pq *priorityQueue) Push(x interface{}) { n := len(*pq); item := x.(*pqItem); item.index = n; *pq = append(*pq, item) }
func (pq *priorityQueue) Pop() interface{}   { old := *pq; n := len(old); item := old[n-1]; old[n-1] = nil; item.index = -1; *pq = old[0 : n-1]; return item }

func (s *GraphStore) ShortestPath(graphID, start, end string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"exists": false, "path": []string{}, "distance": float64(-1)}
	}
	if start == end && g.Nodes[start] {
		return map[string]interface{}{"exists": true, "path": []string{start}, "distance": float64(0)}
	}
	if !g.Nodes[start] || !g.Nodes[end] {
		return map[string]interface{}{"exists": false, "path": []string{}, "distance": float64(-1)}
	}
	if !g.Weighted {
		return s.bfsShortestPath(g, start, end)
	}
	return s.dijkstraShortestPath(g, start, end)
}

func (s *GraphStore) bfsShortestPath(g *Graph, start, end string) map[string]interface{} {
	parent := make(map[string]string)
	visited := make(map[string]bool)
	queue := []string{start}
	visited[start] = true
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if current == end {
			path := []string{}
			for node := end; node != ""; node = parent[node] {
				path = append([]string{node}, path...)
				if node == start {
					break
				}
			}
			return map[string]interface{}{"exists": true, "path": path, "distance": float64(len(path) - 1)}
		}
		neighbors := []string{}
		for neighbor := range g.AdjList[current] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)
		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				visited[neighbor] = true
				parent[neighbor] = current
				queue = append(queue, neighbor)
			}
		}
	}
	return map[string]interface{}{"exists": false, "path": []string{}, "distance": float64(-1)}
}

func (s *GraphStore) dijkstraShortestPath(g *Graph, start, end string) map[string]interface{} {
	dist := make(map[string]float64)
	parent := make(map[string]string)
	for node := range g.Nodes {
		dist[node] = math.Inf(1)
	}
	dist[start] = 0
	pq := make(priorityQueue, 0)
	heap.Init(&pq)
	heap.Push(&pq, &pqItem{node: start, priority: 0})
	for pq.Len() > 0 {
		item := heap.Pop(&pq).(*pqItem)
		current := item.node
		if item.priority > dist[current] {
			continue
		}
		if current == end {
			path := []string{}
			for node := end; node != ""; node = parent[node] {
				path = append([]string{node}, path...)
				if node == start {
					break
				}
			}
			return map[string]interface{}{"exists": true, "path": path, "distance": dist[end]}
		}
		for neighbor, weight := range g.AdjList[current] {
			newDist := dist[current] + weight
			if newDist < dist[neighbor] {
				dist[neighbor] = newDist
				parent[neighbor] = current
				heap.Push(&pq, &pqItem{node: neighbor, priority: newDist})
			}
		}
	}
	return map[string]interface{}{"exists": false, "path": []string{}, "distance": float64(-1)}
}

func (s *GraphStore) AllShortestPaths(graphID, start string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"distances": map[string]float64{}, "paths": map[string][]string{}, "unreachable": []string{}}
	}
	if !g.Nodes[start] {
		unreachable := []string{}
		for node := range g.Nodes {
			unreachable = append(unreachable, node)
		}
		sort.Strings(unreachable)
		return map[string]interface{}{"distances": map[string]float64{}, "paths": map[string][]string{}, "unreachable": unreachable}
	}
	distances := make(map[string]float64)
	parent := make(map[string]string)
	for node := range g.Nodes {
		distances[node] = math.Inf(1)
	}
	distances[start] = 0
	if !g.Weighted {
		visited := make(map[string]bool)
		queue := []string{start}
		visited[start] = true
		for len(queue) > 0 {
			current := queue[0]
			queue = queue[1:]
			neighbors := []string{}
			for neighbor := range g.AdjList[current] {
				neighbors = append(neighbors, neighbor)
			}
			sort.Strings(neighbors)
			for _, neighbor := range neighbors {
				if !visited[neighbor] {
					visited[neighbor] = true
					distances[neighbor] = distances[current] + 1
					parent[neighbor] = current
					queue = append(queue, neighbor)
				}
			}
		}
	} else {
		pq := make(priorityQueue, 0)
		heap.Init(&pq)
		heap.Push(&pq, &pqItem{node: start, priority: 0})
		for pq.Len() > 0 {
			item := heap.Pop(&pq).(*pqItem)
			current := item.node
			if item.priority > distances[current] {
				continue
			}
			for neighbor, weight := range g.AdjList[current] {
				newDist := distances[current] + weight
				if newDist < distances[neighbor] {
					distances[neighbor] = newDist
					parent[neighbor] = current
					heap.Push(&pq, &pqItem{node: neighbor, priority: newDist})
				}
			}
		}
	}
	unreachable := []string{}
	finalDistances := make(map[string]float64)
	finalPaths := make(map[string][]string)
	for node := range g.Nodes {
		if math.IsInf(distances[node], 1) {
			unreachable = append(unreachable, node)
		} else {
			finalDistances[node] = distances[node]
			path := []string{}
			for n := node; n != ""; n = parent[n] {
				path = append([]string{n}, path...)
				if n == start {
					break
				}
			}
			finalPaths[node] = path
		}
	}
	sort.Strings(unreachable)
	return map[string]interface{}{"distances": finalDistances, "paths": finalPaths, "unreachable": unreachable}
}

func (s *GraphStore) HasPath(graphID, start, end string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok {
		return map[string]interface{}{"exists": false}
	}
	if start == end && g.Nodes[start] {
		return map[string]interface{}{"exists": true}
	}
	if !g.Nodes[start] || !g.Nodes[end] {
		return map[string]interface{}{"exists": false}
	}
	visited := make(map[string]bool)
	queue := []string{start}
	visited[start] = true
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if current == end {
			return map[string]interface{}{"exists": true}
		}
		for neighbor := range g.AdjList[current] {
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, neighbor)
			}
		}
	}
	return map[string]interface{}{"exists": false}
}
