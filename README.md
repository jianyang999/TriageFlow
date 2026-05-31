# Contributors
@jianyang999
@ashinms

# About
TriageFlow is a prototype hospital management web app built for NUS orbital. It is meant to streamline patient queues, appointment scheduling, medicine ordering and many more. 

# Motivation
During our time working with healthcare systems while serving National Service, we noticed that the system in use(PACES) was not particularly user friendly. While able to perform the bare necessities, it was unnecessarily tedious to perform various administrative tasks such as scheduling appointments, searching up patients or ordering medicine. So we have decided to make our own healthcare management system where we will make these administrative features user friendly and efficient to use. Not only that, we will add our own features not found in other healthcare systems such as integration of AI to help healthcare workers access patients.

# Aim
Ultimately the goal of this project is to give healthcare workers an easier time performing mundane administrative tasks. This should lessen their overall workload and lead to better quality of life while working.

# Tech Stack
Frontend: React + Vite  

Backend: Node.js + Express  

Database: Supabase(PostgreSQL)  

Auth: Supabase Auth  

Host: Vercel(in the future)  

# Features(More to be added)
1) Queue and triaging system
2) Inventory management system for apparatus and drugs
3) Bed management system
4) Integration of AI to assign priority levels to patients
5) AI assistant for healthcare workers to help assess patients
6) Appointment scheduling system
7) Patient treatment plan
8) Interactive checklist system to ensure medical apparatus is functioning
9) Role based account system(admins, doctors, nurses etc)

# Timeline
1/5/26 - 24/5/26) Self learning, setting up the necessary software
24/5/26 - 1/6/26(MS1)) Group meeting, set up technical proof of concept(queue system)
3rd of June) At this point at least 3 features implemented, and role based account system working
End of June) Web app should be more or less done and polished, will look to deploy on Vercel
June onwards) Start testing

# MS1
 For this milestone we met up and worked together to set up a working queue system.   
 Testing instructions: 
 Download from github. In a terminal under TriageFlow/backend run npm install and npm start. In another terminal under TriageFlow/frontend run npm install and npm run dev. Then head over to http://localhost:5173/ to test the system. Currently it is only runnable on localhost.
