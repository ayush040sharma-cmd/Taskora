import { useState } from "react"

export default function Board() {
  const [tasks, setTasks] = useState([])
  const [input, setInput] = useState("")

  const handleAdd = () => {
    console.log("clicked")
    if (!input) return
    setTasks([...tasks, input])
    setInput("")
  }

  return (
    <div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <button onClick={handleAdd}>
        Add Task
      </button>

      <ul>
        {tasks.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>

    </div>
  )
}