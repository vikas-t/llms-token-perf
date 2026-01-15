package main

import "graphlib/lib"

func createGraph(args []interface{}) map[string]interface{} {
	directed, weighted := false, false
	if len(args) > 0 {
		if opts, ok := args[0].(map[string]interface{}); ok {
			if d, ok := opts["directed"].(bool); ok {
				directed = d
			}
			if w, ok := opts["weighted"].(bool); ok {
				weighted = w
			}
		}
	}
	g := lib.CreateGraph(directed, weighted)
	return map[string]interface{}{"id": g.ID, "directed": g.Directed, "weighted": g.Weighted, "node_count": 0, "edge_count": 0}
}

func addNode(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	ok, err := g.AddNode(str(args[1]))
	if !ok {
		return map[string]interface{}{"success": false, "error": err}
	}
	return map[string]interface{}{"success": true, "node_id": str(args[1])}
}

func addEdge(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	weight := 1.0
	if len(args) > 3 {
		if w, ok := args[3].(float64); ok {
			weight = w
		}
	}
	ok, err := g.AddEdge(str(args[1]), str(args[2]), weight)
	if !ok {
		return map[string]interface{}{"success": false, "error": err}
	}
	return map[string]interface{}{"success": true, "from": str(args[1]), "to": str(args[2]), "weight": weight}
}

func removeNode(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	ok, err, count := g.RemoveNode(str(args[1]))
	if !ok {
		return map[string]interface{}{"success": false, "error": err}
	}
	return map[string]interface{}{"success": true, "removed_edges": count}
}

func removeEdge(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	ok, err := g.RemoveEdge(str(args[1]), str(args[2]))
	if !ok {
		return map[string]interface{}{"success": false, "error": err}
	}
	return map[string]interface{}{"success": true}
}

func getNodes(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"nodes": []string{}, "count": 0}
	}
	nodes := g.GetNodes()
	return map[string]interface{}{"nodes": nodes, "count": len(nodes)}
}

func getEdges(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"edges": []lib.Edge{}, "count": 0}
	}
	edges := g.GetEdges()
	return map[string]interface{}{"edges": edges, "count": len(edges)}
}

func getNeighbors(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"neighbors": []string{}, "count": 0}
	}
	neighbors := g.GetNeighbors(str(args[1]))
	return map[string]interface{}{"neighbors": neighbors, "count": len(neighbors)}
}

func hasNode(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"exists": false}
	}
	return map[string]interface{}{"exists": g.HasNode(str(args[1]))}
}

func hasEdge(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"exists": false}
	}
	exists, weight := g.HasEdge(str(args[1]), str(args[2]))
	if !exists {
		return map[string]interface{}{"exists": false}
	}
	return map[string]interface{}{"exists": true, "weight": weight}
}

func getDegree(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"degree": 0, "in_degree": 0, "out_degree": 0}
	}
	degree, inDeg, outDeg := g.GetDegree(str(args[1]))
	return map[string]interface{}{"degree": degree, "in_degree": inDeg, "out_degree": outDeg}
}

func bfs(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"order": []string{}, "levels": map[string]int{}, "parent": map[string]string{}}
	}
	r := g.BFS(str(args[1]))
	return map[string]interface{}{"order": r.Order, "levels": r.Levels, "parent": r.Parent}
}

func dfs(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"order": []string{}, "discovery": map[string]int{}, "finish": map[string]int{}, "parent": map[string]string{}}
	}
	r := g.DFS(str(args[1]))
	return map[string]interface{}{"order": r.Order, "discovery": r.Discovery, "finish": r.Finish, "parent": r.Parent}
}

func shortestPath(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"exists": false, "path": []string{}, "distance": -1}
	}
	r := g.ShortestPath(str(args[1]), str(args[2]))
	return map[string]interface{}{"exists": r.Exists, "path": r.Path, "distance": r.Distance}
}

func allShortestPaths(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"distances": map[string]float64{}, "paths": map[string][]string{}, "unreachable": []string{}}
	}
	r := g.AllShortestPaths(str(args[1]))
	return map[string]interface{}{"distances": r.Distances, "paths": r.Paths, "unreachable": r.Unreachable}
}

func hasPath(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"exists": false}
	}
	return map[string]interface{}{"exists": g.HasPath(str(args[1]), str(args[2]))}
}

func hasCycle(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"has_cycle": false, "cycle": []string{}}
	}
	has, cycle := g.HasCycle()
	return map[string]interface{}{"has_cycle": has, "cycle": cycle}
}

func isDAG(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"is_dag": false}
	}
	return map[string]interface{}{"is_dag": g.IsDAG()}
}

func topologicalSort(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	ok, order, err := g.TopologicalSort()
	if !ok {
		return map[string]interface{}{"success": false, "error": err}
	}
	return map[string]interface{}{"success": true, "order": order}
}

func connectedComponents(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}
	components := g.ConnectedComponents()
	return map[string]interface{}{"count": len(components), "components": components}
}

func stronglyConnectedComponents(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"count": 0, "components": [][]string{}}
	}
	components := g.StronglyConnectedComponents()
	return map[string]interface{}{"count": len(components), "components": components}
}

func isConnected(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"is_connected": true}
	}
	return map[string]interface{}{"is_connected": g.IsConnected()}
}

func getGraphInfo(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"error": "graph_not_found"}
	}
	return g.GetGraphInfo()
}

func clearGraph(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"success": false, "error": "graph_not_found"}
	}
	g.Clear()
	return map[string]interface{}{"success": true}
}

func cloneGraph(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"error": "graph_not_found"}
	}
	clone := g.Clone()
	return map[string]interface{}{"id": clone.ID, "directed": clone.Directed, "weighted": clone.Weighted, "node_count": clone.NodeCount(), "edge_count": clone.EdgeCount()}
}

func subgraph(args []interface{}) map[string]interface{} {
	g := getGraph(str(args[0]))
	if g == nil {
		return map[string]interface{}{"error": "graph_not_found"}
	}
	nodeList := []string{}
	if nodes, ok := args[1].([]interface{}); ok {
		for _, n := range nodes {
			if s, ok := n.(string); ok {
				nodeList = append(nodeList, s)
			}
		}
	}
	sub := g.Subgraph(nodeList)
	return map[string]interface{}{"id": sub.ID, "directed": sub.Directed, "weighted": sub.Weighted, "node_count": sub.NodeCount(), "edge_count": sub.EdgeCount()}
}
