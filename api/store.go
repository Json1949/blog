package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var idPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type store struct {
	root string
}

func openStore(root string) (*store, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, err
	}
	s := &store{root: abs}
	if err := s.importLegacy(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *store) importLegacy() error {
	posts := filepath.Join(s.root, "posts")
	if dirHasJSON(posts) {
		return nil
	}
	legacy := filepath.Clean(filepath.Join(s.root, "..", "..", "..", "data"))
	if !dirHasJSON(filepath.Join(legacy, "posts")) {
		return nil
	}
	log.Printf("正在把已有文章从 %s 复制到 %s", legacy, s.root)
	for _, name := range []string{"posts", "categories", "images"} {
		if err := copyTree(filepath.Join(legacy, name), filepath.Join(s.root, name)); err != nil {
			return err
		}
	}
	for _, name := range []string{"meta.json", "settings.json"} {
		src := filepath.Join(legacy, name)
		if _, err := os.Stat(src); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return err
		}
		if err := copyFile(src, filepath.Join(s.root, name)); err != nil {
			return err
		}
	}
	return nil
}

func dirHasJSON(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") && !strings.HasSuffix(entry.Name(), ".tmp") {
			return true
		}
	}
	return false
}

func copyTree(src, dest string) error {
	info, err := os.Stat(src)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if !info.IsDir() {
		return nil
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || strings.HasSuffix(entry.Name(), ".tmp") {
			continue
		}
		if err := copyFile(filepath.Join(src, entry.Name()), filepath.Join(dest, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func normalizeID(id string) (string, error) {
	key := strings.ToLower(strings.TrimSpace(id))
	if !idPattern.MatchString(key) {
		return "", errors.New("编号无效。")
	}
	return key, nil
}

func (s *store) kindDir(kind string) (string, error) {
	if kind != "posts" && kind != "categories" {
		return "", errors.New("未知的数据类型。")
	}
	dir := filepath.Join(s.root, kind)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func (s *store) list(kind string) ([]any, error) {
	dir, err := s.kindDir(kind)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	rows := make([]any, 0)
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".json") || strings.HasSuffix(name, ".tmp") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		var value any
		if err := json.Unmarshal(raw, &value); err != nil {
			return nil, err
		}
		rows = append(rows, value)
	}
	return rows, nil
}

func (s *store) put(kind, id string, value any) error {
	key, err := normalizeID(id)
	if err != nil {
		return err
	}
	dir, err := s.kindDir(kind)
	if err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, key+".json"), value)
}

func (s *store) remove(kind, id string) error {
	key, err := normalizeID(id)
	if err != nil {
		return err
	}
	dir, err := s.kindDir(kind)
	if err != nil {
		return err
	}
	err = os.Remove(filepath.Join(dir, key+".json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s *store) readMeta() (map[string]any, error) {
	value, err := readJSONFile(filepath.Join(s.root, "meta.json"))
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]any{}, nil
		}
		return nil, err
	}
	object, ok := value.(map[string]any)
	if !ok || object == nil {
		return map[string]any{}, nil
	}
	return object, nil
}

func (s *store) writeMeta(partial map[string]any) error {
	current, err := s.readMeta()
	if err != nil {
		return err
	}
	for key, value := range partial {
		current[key] = value
	}
	return writeJSON(filepath.Join(s.root, "meta.json"), current)
}

func (s *store) readSettings() (any, error) {
	value, err := readJSONFile(filepath.Join(s.root, "settings.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	return value, err
}

func (s *store) writeSettings(value any) error {
	return writeJSON(filepath.Join(s.root, "settings.json"), value)
}

type imageRecord struct {
	Type      string
	CreatedAt any
	Bytes     []byte
}

func (s *store) imagePaths(id string) (string, string, string, error) {
	key, err := normalizeID(id)
	if err != nil {
		return "", "", "", err
	}
	dir := filepath.Join(s.root, "images")
	return dir, filepath.Join(dir, key), filepath.Join(dir, key+".json"), nil
}

func (s *store) listImageIDs() ([]string, error) {
	dir := filepath.Join(s.root, "images")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if idPattern.MatchString(entry.Name()) {
			ids = append(ids, strings.ToLower(entry.Name()))
		}
	}
	return ids, nil
}

func (s *store) putImage(id, mime string, createdAt any, bytes []byte) error {
	dir, bin, meta, err := s.imagePaths(id)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := writeAtomic(bin, bytes); err != nil {
		return err
	}
	key, _ := normalizeID(id)
	if mime == "" {
		mime = "application/octet-stream"
	}
	if createdAt == nil {
		createdAt = 0
	}
	return writeJSON(meta, map[string]any{
		"id":        key,
		"type":      mime,
		"createdAt": createdAt,
	})
}

func (s *store) getImage(id string) (*imageRecord, error) {
	_, bin, meta, err := s.imagePaths(id)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(meta)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var header struct {
		Type      string `json:"type"`
		CreatedAt any    `json:"createdAt"`
	}
	if err := json.Unmarshal(raw, &header); err != nil {
		return nil, err
	}
	bytes, err := os.ReadFile(bin)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	return &imageRecord{Type: header.Type, CreatedAt: header.CreatedAt, Bytes: bytes}, nil
}

func (s *store) removeImage(id string) error {
	_, bin, meta, err := s.imagePaths(id)
	if err != nil {
		return err
	}
	for _, path := range []string{bin, meta} {
		err := os.Remove(path)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func readJSONFile(path string) (any, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func writeJSON(path string, value any) error {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return writeAtomic(path, raw)
}

func writeAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
