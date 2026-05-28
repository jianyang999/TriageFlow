# TriageFlow

# Contributors
@jianyang999
@ashinms

# About
TriageFlow is a prototype hospital management web app built for NUS orbital. It is meant to streamline patient queues, appointment scheduling, medicine ordering and many more. 

# Tech Stack
Frontend: React + Vite  

Backend: Node.js + Express  

Database: Supabase(PostgreSQL)  

Auth: Supabase Auth  

Host: Vercel(in the future)  


# Proof of concept
For the technical proof of concept we want to make sure that the queue and triaging system works before implementing any other features as this is the main function of our product. Below is how we developed it.  
1) In the frontend folder, we create a folder called pages where we will store all the pages we will be creating. For this proof of concept, the pages folder will only contain QueuePage.jsx, the file containing the code for the queue page to be used in index.html.    
2) Next we update main.jsx to route to QueuePage. Code can be seen in the repo.  
3) Update QueuePage.jsx to contain display and queue logic, as well as fetch data from backend(not setup yet)  
4) Setup server.js in the backend. Code can be seen in the repo.

