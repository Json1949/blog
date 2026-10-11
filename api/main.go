package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func main() {
	data, err := openStore("data")
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/store/settings", func(w http.ResponseWriter, r *http.Request) {
		value, err := data.readSettings()
		if err != nil {
			fail(w, err)
			return
		}
		sendJSON(w, value)
	})
	mux.HandleFunc("PUT /api/store/settings", func(w http.ResponseWriter, r *http.Request) {
		value, err := readJSON(r)
		if err != nil {
			fail(w, err)
			return
		}
		if err := data.writeSettings(value); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /api/store/meta", func(w http.ResponseWriter, r *http.Request) {
		value, err := data.readMeta()
		if err != nil {
			fail(w, err)
			return
		}
		sendJSON(w, value)
	})
	mux.HandleFunc("PUT /api/store/meta", func(w http.ResponseWriter, r *http.Request) {
		value, err := readJSON(r)
		if err != nil {
			fail(w, err)
			return
		}
		object, _ := value.(map[string]any)
		if object == nil {
			object = map[string]any{}
		}
		if err := data.writeMeta(object); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /api/store/images", func(w http.ResponseWriter, r *http.Request) {
		ids, err := data.listImageIDs()
		if err != nil {
			fail(w, err)
			return
		}
		sendJSON(w, ids)
	})
	mux.HandleFunc("GET /api/store/images/{id}", func(w http.ResponseWriter, r *http.Request) {
		image, err := data.getImage(r.PathValue("id"))
		if err != nil {
			fail(w, err)
			return
		}
		if image == nil {
			text(w, http.StatusNotFound, "找不到这张图片。")
			return
		}
		kind := image.Type
		if kind == "" {
			kind = "application/octet-stream"
		}
		w.Header().Set("Content-Type", kind)
		w.Header().Set("X-Created-At", formatCreated(image.CreatedAt))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(image.Bytes)
	})
	mux.HandleFunc("PUT /api/store/images/{id}", func(w http.ResponseWriter, r *http.Request) {
		value, err := readJSON(r)
		if err != nil {
			fail(w, err)
			return
		}
		object, _ := value.(map[string]any)
		if object == nil {
			fail(w, errString("图片内容是空的。"))
			return
		}
		raw := stringField(object, "dataUrl")
		encoded := ""
		if i := strings.Index(raw, ","); strings.HasPrefix(raw, "data:") && i >= 0 {
			encoded = raw[i+1:]
		} else {
			encoded = stringField(object, "base64")
		}
		if encoded == "" {
			fail(w, errString("图片内容是空的。"))
			return
		}
		bytes, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			bytes, err = base64.RawStdEncoding.DecodeString(encoded)
		}
		if err != nil {
			fail(w, errString("图片内容是空的。"))
			return
		}
		mime := stringField(object, "type")
		if err := data.putImage(r.PathValue("id"), mime, object["createdAt"], bytes); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("DELETE /api/store/images/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := data.removeImage(r.PathValue("id")); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /api/store/{kind}", func(w http.ResponseWriter, r *http.Request) {
		kind := r.PathValue("kind")
		if kind != "posts" && kind != "categories" {
			text(w, http.StatusNotFound, "找不到。")
			return
		}
		rows, err := data.list(kind)
		if err != nil {
			fail(w, err)
			return
		}
		sendJSON(w, rows)
	})
	mux.HandleFunc("PUT /api/store/{kind}/{id}", func(w http.ResponseWriter, r *http.Request) {
		kind := r.PathValue("kind")
		if kind != "posts" && kind != "categories" {
			text(w, http.StatusNotFound, "找不到。")
			return
		}
		value, err := readJSON(r)
		if err != nil {
			fail(w, err)
			return
		}
		object, ok := value.(map[string]any)
		if !ok || object == nil {
			object = map[string]any{}
		}
		object["id"] = strings.ToLower(r.PathValue("id"))
		if err := data.put(kind, r.PathValue("id"), object); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("DELETE /api/store/{kind}/{id}", func(w http.ResponseWriter, r *http.Request) {
		kind := r.PathValue("kind")
		if kind != "posts" && kind != "categories" {
			text(w, http.StatusNotFound, "找不到。")
			return
		}
		if err := data.remove(kind, r.PathValue("id")); err != nil {
			fail(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	addr := "127.0.0.1:8787"
	log.Printf("接口 http://%s  数据 %s", addr, data.root)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

func readJSON(r *http.Request) (any, error) {
	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return map[string]any{}, nil
	}
	var value any
	if err := json.Unmarshal(body, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func sendJSON(w http.ResponseWriter, value any) {
	raw, err := json.Marshal(value)
	if err != nil {
		fail(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}

func text(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(message))
}

func fail(w http.ResponseWriter, err error) {
	message := "没能写入 data 文件夹。"
	if err != nil && err.Error() != "" {
		message = err.Error()
	}
	text(w, http.StatusBadRequest, message)
}

type errString string

func (e errString) Error() string { return string(e) }

func stringField(object map[string]any, key string) string {
	value, _ := object[key].(string)
	return value
}

func formatCreated(value any) string {
	switch n := value.(type) {
	case float64:
		return strconv.FormatInt(int64(n), 10)
	case json.Number:
		return n.String()
	case int64:
		return strconv.FormatInt(n, 10)
	case int:
		return strconv.Itoa(n)
	case string:
		return n
	default:
		if value == nil {
			return ""
		}
		return fmt.Sprint(value)
	}
}
