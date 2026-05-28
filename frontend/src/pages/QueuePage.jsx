import { useState, useEffect } from 'react'

// for copy pasting purposes
const API = 'http://localhost:3001'

// Priority levels based on PACS(Sg standard)
const PRIORITY = {
  p1: { label: 'P1 - Resuscitation', color: '#ff2d2d' },
  p2: { label: 'P2 - Emergency',     color: '#ff8c00' },
  p3: { label: 'P3 - Urgent',        color: '#ffd700' },
  p4: { label: 'P4 - Non-Urgent',    color: '#52c41a' },
}

function QueuePage() {
// initialising empty queue
  const [queue, setQueue] = useState([])

  // fetch queue data from backend, convert to json, save patient into queue
  useEffect(() => {
    fetch(`${API}/queue`)
      .then(res => res.json())
      .then(data => setQueue(data.queue))
  }, [])

  // logic to display queue
  return (
    <div>
      <h1>Patient Queue</h1>
      {queue.length === 0
        ? <p>No patients in queue</p>
        : queue.map(patient => (
            <div key={patient.id}>
               <strong>{patient.ticketNumber}</strong> — {patient.name} ({PRIORITY[patient.priority]?.label ?? patient.priority})
            </div>
          ))
      }
    </div>
  )
}

export default QueuePage