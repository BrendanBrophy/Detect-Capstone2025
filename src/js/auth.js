/***************************************************************************************************/
/*  Project:         Detect-Capstone2025
/*  Description:     Authentication for login page
/*  Author:          Brendan Brophy
/*  Date:            2025-06-01
/*  (last edited)       
/*  File:            auth.js

Notes:
    Usernames and passwords are hardcoded into the software to eliminate the need for a backend.
    This is intended for proof-of-concept use only. Do not use in production environments.
/***************************************************************************************************/

const demoUsers = {
    "admin1": "password1",
    "admin2": "password2",
    "admin3": "password3",
  };
  
  document.getElementById("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
  
    if (demoUsers[username] && demoUsers[username] === password) {
      localStorage.setItem("loggedIn", "true");
      window.location.href = "public/gps.html";
    } else {
      document.getElementById("message").textContent = "Invalid login.";
    }
  });
  