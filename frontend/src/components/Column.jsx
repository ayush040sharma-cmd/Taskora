import Card from "./Card"

export default function Column({ title, tasks }) {
  return (
    <div style={{
      background:"#F4F5F7",
      padding:"10px",
      borderRadius:"8px",
      width:"250px"
    }}>

      <h4>{title}</h4>

      {tasks.map((task, i) => (
        <Card key={i} title={task} />
      ))}

    </div>
  )
}