package main

import (
	"encoding/json"
	"fmt"
	"graphlib/lib"
	"io"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fatal("missing command")
	}
	cmd := os.Args[1]
	input, _ := io.ReadAll(os.Stdin)
	var args []interface{}
	json.Unmarshal(input, &args)
	result := dispatch(cmd, args)
	output, _ := json.Marshal(result)
	fmt.Println(string(output))
}

func dispatch(cmd string, args []interface{}) interface{} {
	switch cmd {
	case "create_graph":
		return createGraph(args)
	case "add_node":
		return addNode(args)
	case "add_edge":
		return addEdge(args)
	case "remove_node":
		return removeNode(args)
	case "remove_edge":
		return removeEdge(args)
	case "get_nodes":
		return getNodes(args)
	case "get_edges":
		return getEdges(args)
	case "get_neighbors":
		return getNeighbors(args)
	case "has_node":
		return hasNode(args)
	case "has_edge":
		return hasEdge(args)
	case "get_degree":
		return getDegree(args)
	case "bfs":
		return bfs(args)
	case "dfs":
		return dfs(args)
	case "shortest_path":
		return shortestPath(args)
	case "all_shortest_paths":
		return allShortestPaths(args)
	case "has_path":
		return hasPath(args)
	case "has_cycle":
		return hasCycle(args)
	case "is_dag":
		return isDAG(args)
	case "topological_sort":
		return topologicalSort(args)
	case "connected_components":
		return connectedComponents(args)
	case "strongly_connected_components":
		return stronglyConnectedComponents(args)
	case "is_connected":
		return isConnected(args)
	case "get_graph_info":
		return getGraphInfo(args)
	case "clear_graph":
		return clearGraph(args)
	case "clone_graph":
		return cloneGraph(args)
	case "subgraph":
		return subgraph(args)
	default:
		fatal("unknown command: " + cmd)
	}
	return nil
}

func fatal(msg string) { fmt.Fprintln(os.Stderr, msg); os.Exit(1) }
func str(v interface{}) string { s, _ := v.(string); return s }
func getGraph(id string) *lib.Graph { return lib.GetStore().Get(id) }
