import { useState } from 'react'

interface Todo {
  id: string
  text: string
  done: boolean
}

const initialTodos: Todo[] = [
  { id: '1', text: 'Buy groceries', done: false },
  { id: '2', text: 'Write report', done: false },
  { id: '3', text: 'Call Mom', done: true },
]

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>(initialTodos)
  const [input, setInput] = useState('')

  const addTodo = () => {
    const text = input.trim()
    if (!text) return
    const newTodo: Todo = { id: Date.now().toString(), text, done: false }
    setTodos(prev => [newTodo, ...prev])
    setInput('')
  }

  const toggleTodo = (id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const deleteTodo = (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  return (
    <main className="page">
      <header className="header">
        <h1 className="header-title">Todo</h1>
        <p className="header-subtitle">3 tasks to start • add your own</p>
      </header>

      <section className="card">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="input"
            placeholder="New task..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTodo()}
            aria-label="New task"
          />
          <button className="btn btn-primary" onClick={addTodo}>Add</button>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {todos.map(todo => (
            <li key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={() => toggleTodo(todo.id)}
                aria-label={`Mark ${todo.text} as done`}
              />
              <span style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none', color: todo.done ? 'var(--text-dim)' : 'var(--text)' }}>
                {todo.text}
              </span>
              <button className="btn" onClick={() => deleteTodo(todo.id)} aria-label={`Delete ${todo.text}`}>Delete</button>
            </li>
          ))}
          {todos.length === 0 && (
            <li style={{ color: 'var(--text-dim)', padding: '12px 0' }}>No tasks yet</li>
          )}
        </ul>
      </section>
    </main>
  )
}
