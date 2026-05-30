import { useState, useEffect } from 'react'

const API = 'http://localhost:3001'

const PRIORITY = {
  p1: { label: 'P1 - Resuscitation', color: '#ff2d2d' },
  p2: { label: 'P2 - Emergency',     color: '#ff8c00' },
  p3: { label: 'P3 - Urgent',        color: '#ffd700' },
  p4: { label: 'P4 - Non-Urgent',    color: '#52c41a' },
}

function QueuePage() {
  const [queue, setQueue] = useState([])

  useEffect(() => {
    fetch(`${API}/queue`)
      .then(res => res.json())
      .then(data => setQueue(data.queue))
  }, [])

  return (
    <div>
      <h1>Patient Queue</h1>
      {queue.length === 0
        ? <p>No patients in queue</p>
        : queue.map(patient => (
            <div key={patient.id}>
              <strong>{patient.ticket_number}</strong> — {patient.full_name} ({PRIORITY[patient.priority]?.label ?? patient.priority})
            </div>
          ))
      }
    </div>
  )
}

export default QueuePage