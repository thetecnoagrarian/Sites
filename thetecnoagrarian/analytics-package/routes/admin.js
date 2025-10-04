const express = require('express');
const router = express.Router();
const Analytics = require('../models/analytics');

// Initialize analytics tables
Analytics.init();

// Analytics dashboard route
router.get('/analytics', async (req, res) => {
    try {
        const totalStats = Analytics.getTotalStats();
        const pageViewStats = Analytics.getPageViewStats(30);
        const recentActivity = Analytics.getRecentActivity(20);
        
        res.render('analytics', {
            title: 'Analytics Dashboard',
            totalStats,
            pageViewStats,
            recentActivity
        });
    } catch (error) {
        console.error('Error loading analytics:', error);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});

// API endpoint for getting stats
router.get('/api/stats', async (req, res) => {
    try {
        const totalStats = Analytics.getTotalStats();
        res.json(totalStats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

module.exports = router;
