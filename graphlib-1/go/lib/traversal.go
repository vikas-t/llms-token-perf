package lib

import "sort"

func (s *GraphStore) BFS(graphID, start string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok || !g.Nodes[start] {
		return map[string]interface{}{"order": []string{}, "levels": map[string]int{}, "parent": map[string]string{}}
	}
	order := []string{}
	levels := make(map[string]int)
	parent := make(map[string]string)
	visited := make(map[string]bool)
	queue := []string{start}
	visited[start] = true
	levels[start] = 0
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		order = append(order, current)
		neighbors := []string{}
		for neighbor := range g.AdjList[current] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)
		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				visited[neighbor] = true
				levels[neighbor] = levels[current] + 1
				parent[neighbor] = current
				queue = append(queue, neighbor)
			}
		}
	}
	return map[string]interface{}{"order": order, "levels": levels, "parent": parent}
}

func (s *GraphStore) DFS(graphID, start string) map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	g, ok := s.graphs[graphID]
	if !ok || !g.Nodes[start] {
		return map[string]interface{}{"order": []string{}, "discovery": map[string]int{}, "finish": map[string]int{}, "parent": map[string]string{}}
	}
	order := []string{}
	discovery := make(map[string]int)
	finish := make(map[string]int)
	parent := make(map[string]string)
	visited := make(map[string]bool)
	time := 0
	var dfsVisit func(node string)
	dfsVisit = func(node string) {
		visited[node] = true
		discovery[node] = time
		time++
		order = append(order, node)
		neighbors := []string{}
		for neighbor := range g.AdjList[node] {
			neighbors = append(neighbors, neighbor)
		}
		sort.Strings(neighbors)
		for _, neighbor := range neighbors {
			if !visited[neighbor] {
				parent[neighbor] = node
				dfsVisit(neighbor)
			}
		}
		finish[node] = time
		time++
	}
	dfsVisit(start)
	return map[string]interface{}{"order": order, "discovery": discovery, "finish": finish, "parent": parent}
}
