// Construction OS — Go Worker
// See context/00_master_construction_os.md for phase-specific spec
package main

import (
	"fmt"
	"net/http"
	"os"
)

func main() {
	http.HandleFunc("/health/live", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok"}`)
	})
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}
	http.ListenAndServe(":"+port, nil)
}
