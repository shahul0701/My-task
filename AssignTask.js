// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD9ymWqihHWbVb4IRop1lXT-huLjBvS50w",
  authDomain: "task-manager-602da.firebaseapp.com",
  projectId: "task-manager-602da",
  storageBucket: "task-manager-602da.appspot.com",
  messagingSenderId: "438978699329",
  appId: "1:438978699329:web:9f475d04352bbdaa5ce6c0"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// DOM elements
const assignToSelect = document.getElementById('assignToSelect');
const reportToSelect = document.getElementById('reportToSelect');
const homeBtn = document.getElementById('homeBtn');
const createTaskBtn = document.getElementById('createTaskBtn');
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const sinoInput = document.getElementById('sinoInput');
const cancelBtn = document.getElementById('cancelBtn');
const assignedTasksTableBody = document.querySelector('#assignedTasksTable tbody');

let assignedTasks = [];
let usersMap = {};    // userId => displayName/email
let usersData = {};   // userId => full user object

// Navigation
homeBtn.addEventListener('click', () => window.location.href = 'Home.html');

// Open modal to create task
createTaskBtn.addEventListener('click', async () => {
  taskForm.reset();
  const nextSINO = await generateSINO();
  sinoInput.value = nextSINO;
  taskModal.style.display = 'flex';
});

// Close modal
cancelBtn.addEventListener('click', () => taskModal.style.display = 'none');
taskModal.addEventListener('click', e => {
  if (e.target === taskModal) taskModal.style.display = 'none';
});

// Generate SINO
async function generateSINO() {
  try {
    const snapshot = await db.collection('assignedTasks').get();
    let maxNum = 0;
    snapshot.forEach(doc => {
      const match = doc.data().SINO?.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return String(maxNum + 1).padStart(3, '0');
  } catch (error) {
    console.error("Error generating SINO:", error);
    return "001";
  }
}

// Load users into dropdowns
async function loadUsersIntoSelects() {
  try {
    const snapshot = await db.collection('users').get();
    assignToSelect.innerHTML = '<option value="">Select Assignee</option>';
    reportToSelect.innerHTML = '<option value="">Select Reporter</option>';
    usersMap = {};
    usersData = {};

    snapshot.forEach(doc => {
      const user = doc.data();
      const username = user.name?.trim() || user.displayName?.trim() || (user.email ? user.email.split('@')[0] : doc.id);
      const displayText = `${username}${user.email ? ` (${user.email})` : ''}`;

      usersMap[doc.id] = username;
      usersData[doc.id] = user;

      const opt1 = document.createElement('option');
      opt1.value = doc.id;
      opt1.textContent = displayText;
      assignToSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = doc.id;
      opt2.textContent = displayText;
      reportToSelect.appendChild(opt2);
    });
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

// Load all tasks
async function loadAssignedTasks() {
  await loadUsersIntoSelects();
  try {
    const snapshot = await db.collection('assignedTasks').orderBy('SINO').get();
    assignedTasks = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        assignToName: usersMap[data.assignTo] || data.assignTo,
        reportToName: usersMap[data.reportTo] || data.reportTo,
      };
    });
    renderTable();
  } catch (error) {
    console.error("Error loading tasks:", error);
  }
}

// Render task table
function renderTable() {
  assignedTasksTableBody.innerHTML = '';
  assignedTasks.forEach(task => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${task.SINO || ''}</td>
      <td>${task.companyName || ''}</td>
      <td>${task.description || ''}</td>
      <td>${task.assignToName || ''}</td>
      <td>${task.reportToName || ''}</td>
      <td>${task.dueDate || ''}</td>
      <td>${task.priority || ''}</td>
      <td>
        <button class="edit-btn" data-id="${task.id}">Edit</button>
        <button class="delete-btn" data-id="${task.id}">Delete</button>
      </td>
    `;
    assignedTasksTableBody.appendChild(tr);
  });
  attachRowEventListeners();
}

// Edit/Delete buttons
function attachRowEventListeners() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      const task = assignedTasks.find(t => t.id === id);
      if (!task) return alert('Task not found.');

      const updated = { ...task };
      const fields = ['companyName', 'description', 'assignTo', 'reportTo', 'dueDate', 'priority'];

      for (const field of fields) {
        let currentVal = updated[field];
        if ((field === 'assignTo' || field === 'reportTo') && usersMap[currentVal]) {
          currentVal = usersMap[currentVal];
        }
        const newVal = prompt(`Edit ${field}`, currentVal || '');
        if (newVal !== null) {
          if (field === 'assignTo' || field === 'reportTo') {
            const userId = Object.keys(usersMap).find(k => usersMap[k].toLowerCase() === newVal.toLowerCase());
            if (userId) {
              updated[field] = userId;
            } else {
              alert(`User "${newVal}" not found. Field not updated.`);
            }
          } else {
            updated[field] = newVal.trim();
          }
        }
      }

      try {
        await db.collection('assignedTasks').doc(id).set(updated);
        alert('Task updated.');
        loadAssignedTasks();
      } catch (error) {
        console.error("Update error:", error);
        alert('Update failed. Please try again.');
      }
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.target.dataset.id;
      if (confirm('Delete this task?')) {
        try {
          await db.collection('assignedTasks').doc(id).delete();
          alert('Task deleted.');
          loadAssignedTasks();
        } catch (error) {
          console.error("Delete error:", error);
          alert('Delete failed.');
        }
      }
    });
  });
}

// Handle task submission
taskForm.addEventListener('submit', async e => {
  e.preventDefault();

  const formData = new FormData(taskForm);
  const data = {};
  formData.forEach((val, key) => data[key] = val.trim());

  if (!data.companyName || !data.assignTo || !data.reportTo || !data.dueDate) {
    alert("Please fill all required fields.");
    return;
  }

  try {
    data.SINO = data.sino;
    delete data.sino;
    data.assignedAt = firebase.firestore.FieldValue.serverTimestamp();

    const taskRef = await db.collection('assignedTasks').add(data);

    // Create notification
    await db.collection('notifications').add({
      userId: data.assignTo,
      message: `New task assigned: ${data.description || 'No description'}`,
      taskId: taskRef.id,
      read: false,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    // EmailJS
    const user = usersData[data.assignTo];
    if (user && user.email) {
      try {
        await emailjs.send("service_52ohcsf", "template_ogel2yd", {
          to_name: user.name || user.displayName || 'User',
          to_email: user.email,
          company: data.companyName,
          description: data.description || '',
          priority: data.priority || 'Normal',
          due_date: data.dueDate
        });
        console.log("Email sent to", user.email);
      } catch (emailErr) {
        console.warn("Email sending failed:", emailErr);
      }
    }

    alert('Task assigned successfully.');
    taskModal.style.display = 'none';
    await loadAssignedTasks();
  } catch (error) {
    console.error("Error assigning task:", error);
    alert("Failed to assign task. Please check console for more details.");
  }
});

// Sync notifications on login
firebase.auth().onAuthStateChanged(async user => {
  if (!user) return;
  const currentUserId = user.uid;

  try {
    const assignedTasksSnapshot = await db.collection('assignedTasks')
      .where('assignTo', '==', currentUserId).get();

    for (const taskDoc of assignedTasksSnapshot.docs) {
      const existingNotificationsSnapshot = await db.collection('notifications')
        .where('userId', '==', currentUserId)
        .where('taskId', '==', taskDoc.id).get();

      if (existingNotificationsSnapshot.empty) {
        await db.collection('notifications').add({
          userId: currentUserId,
          message: `You have been assigned a new task: ${taskDoc.data().description || 'No description'}`,
          taskId: taskDoc.id,
          read: false,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.error('Error syncing notifications:', error);
  }
});

// Initial Load
loadUsersIntoSelects().then(loadAssignedTasks);
