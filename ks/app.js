const express = require('express');
const app = express();
const port = 3000;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard',
    user: { name: 'John Doe', role: 'Admin' },
    stats: {
      totalUsers: 1245,
      totalOrders: 567,
      totalRevenue: '$45,230',
      activeSessions: 89
    },
    recentOrders: [
      { id: '#1024', customer: 'Alice Smith', product: 'MacBook Pro', amount: '$1,999', status: 'Completed', date: '2024-01-15' },
      { id: '#1023', customer: 'Bob Johnson', product: 'iPhone 15', amount: '$999', status: 'Processing', date: '2024-01-15' },
      { id: '#1022', customer: 'Carol White', product: 'iPad Air', amount: '$599', status: 'Shipped', date: '2024-01-14' },
      { id: '#1021', customer: 'David Brown', product: 'Apple Watch', amount: '$399', status: 'Completed', date: '2024-01-14' },
      { id: '#1020', customer: 'Eve Davis', product: 'AirPods', amount: '$179', status: 'Processing', date: '2024-01-13' }
    ]
  });
});

app.get('/analytics', (req, res) => {
  res.render('analytics', {
    title: 'Analytics',
    user: { name: 'John Doe', role: 'Admin' }
  });
});

app.get('/users', (req, res) => {
  res.render('users', {
    title: 'Users',
    user: { name: 'John Doe', role: 'Admin' }
  });
});

app.get('/settings', (req, res) => {
  res.render('settings', {
    title: 'Settings',
    user: { name: 'John Doe', role: 'Admin' }
  });
});

app.listen(port, () => {
  console.log(`Dashboard running at http://localhost:${port}`);
});