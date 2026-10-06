import { useState, useEffect } from 'react';
import { fetchTasks } from '../api';

const DEBOUNCE_MS = 300;

export function useTasks(query, status, page, pageSize) {
  const [tasks, setTasks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Wait until the user pauses typing before searching
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null); // clear any previous error

    fetchTasks({ query: debouncedQuery, status, page, pageSize, signal: controller.signal })
      .then((data) => {
        setTasks(data.items);
        setTotal(data.total);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return; // a newer request replaced this one
        setError(err.message);
        setLoading(false); // previously missing, so the UI stayed on "Loading" forever
      });

    // Cancel the in-flight request if inputs change, so stale responses can't overwrite new ones
    return () => controller.abort();
  }, [debouncedQuery, status, page, pageSize]);

  return { tasks, total, loading, error };
}