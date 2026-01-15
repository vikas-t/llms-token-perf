package main

import (
	"encoding/json"
	"fmt"
	"graph/lib"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "Usage: graphlib <command>")
		os.Exit(1)
	}
	var args []interface{}
	json.NewDecoder(os.Stdin).Decode(&args)
	result := dispatch(os.Args[1], args)
	lib.Store.Save()
	json.NewEncoder(os.Stdout).Encode(result)
}

func dispatch(cmd string, a []interface{}) interface{} {
	s := lib.Store
	str := func(i int) string { if i < len(a) { if v, ok := a[i].(string); ok { return v } }; return "" }
	flt := func(i int) float64 { if i < len(a) { if v, ok := a[i].(float64); ok { return v } }; return 1.0 }
	switch cmd {
	case "create_graph":
		m := map[string]interface{}{}; if len(a) > 0 { if v, ok := a[0].(map[string]interface{}); ok { m = v } }
		d, _ := m["directed"].(bool); w, _ := m["weighted"].(bool)
		return s.CreateGraph(d, w)
	case "add_node": return s.AddNode(str(0), str(1))
	case "add_edge": w := 1.0; if len(a) > 3 { w = flt(3) }; return s.AddEdge(str(0), str(1), str(2), w)
	case "remove_node": return s.RemoveNode(str(0), str(1))
	case "remove_edge": return s.RemoveEdge(str(0), str(1), str(2))
	case "get_nodes": return s.GetNodes(str(0))
	case "get_edges": return s.GetEdges(str(0))
	case "get_neighbors": return s.GetNeighbors(str(0), str(1))
	case "has_node": return s.HasNode(str(0), str(1))
	case "has_edge": return s.HasEdge(str(0), str(1), str(2))
	case "get_degree": return s.GetDegree(str(0), str(1))
	case "bfs": return s.BFS(str(0), str(1))
	case "dfs": return s.DFS(str(0), str(1))
	case "shortest_path": return s.ShortestPath(str(0), str(1), str(2))
	case "all_shortest_paths": return s.AllShortestPaths(str(0), str(1))
	case "has_path": return s.HasPath(str(0), str(1), str(2))
	case "has_cycle": return s.HasCycle(str(0))
	case "is_dag": return s.IsDAG(str(0))
	case "topological_sort": return s.TopologicalSort(str(0))
	case "connected_components": return s.ConnectedComponents(str(0))
	case "strongly_connected_components": return s.StronglyConnectedComponents(str(0))
	case "is_connected": return s.IsConnected(str(0))
	case "get_graph_info": return s.GetGraphInfo(str(0))
	case "clear_graph": return s.ClearGraph(str(0))
	case "clone_graph": return s.CloneGraph(str(0))
	case "subgraph":
		nodes := []string{}
		if len(a) > 1 { if arr, ok := a[1].([]interface{}); ok { for _, v := range arr { if n, ok := v.(string); ok { nodes = append(nodes, n) } } } }
		return s.Subgraph(str(0), nodes)
	default: return map[string]interface{}{"error": "unknown_command"}
	}
}
