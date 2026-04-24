export default function Card({ title }) {
  return (
    <div style={{
      background:"white",
      padding:"10px",
      borderRadius:"6px",
      marginBottom:"10px",
      boxShadow:"0 1px 3px rgba(0,0,0,0.1)"
    }}>
      {title}
    </div>
  )
}