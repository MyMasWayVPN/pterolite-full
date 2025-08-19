import { useEffect, useState } from 'react'
import { api } from './api.js'
export default function App() {
  const [containers, setContainers] = useState([])
  const [loading, setLoading] = useState(false)
  const fetchContainers = async () => { setLoading(true); try{ const res = await api.get('/containers'); setContainers(res.data) } catch(e){console.error(e)} finally{setLoading(false)}}
  const startContainer = async (id) => { await api.post('/containers/'+id+'/start'); fetchContainers() }
  const stopContainer = async (id) => { await api.post('/containers/'+id+'/stop'); fetchContainers() }
  useEffect(()=>{fetchContainers(); const iv = setInterval(fetchContainers,5000); return ()=>clearInterval(iv)},[])
  return <div className="p-4 font-sans"><h1>PteroLite Dashboard</h1>{loading? <p>Loading...</p>:<table border="1"><thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead><tbody>{containers.map(c=><tr key={c.Id}><td>{c.Names[0].replace('/','')}</td><td>{c.State}</td><td>{c.State!=='running'?<button onClick={()=>startContainer(c.Id)}>Start</button>:<button onClick={()=>stopContainer(c.Id)}>Stop</button>}</td></tr>)}</tbody></table>}</div>