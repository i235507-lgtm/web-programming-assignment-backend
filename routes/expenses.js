const router = require('express').Router();
const { body } = require('express-validator');
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const Expense = require('../models/Expense');

const CATEGORIES = [
  'Food', 'Transport', 'Housing', 'Entertainment',
  'Healthcare', 'Education', 'Shopping', 'Utilities', 'Other',
];

router.get('/rankings', auth, async (req, res, next) => {
  try {
    const { period = 'all' } = req.query;
    const userId = new mongoose.Types.ObjectId(req.userId);

    const dateFilter = {};
    if (period !== 'all') {
      const now = new Date();
      const start = new Date(now);
      if (period === 'week') start.setDate(now.getDate() - 7);
      else if (period === 'month') start.setMonth(now.getMonth() - 1);
      else if (period === 'year') start.setFullYear(now.getFullYear() - 1);
      dateFilter.date = { $gte: start };
    }

    const matchStage = { $match: { userId, ...dateFilter } };

    const categoryRankings = await Expense.aggregate([
      matchStage,
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' },
          maxAmount: { $max: '$amount' },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    const topExpenses = await Expense.aggregate([
      matchStage,
      { $sort: { amount: -1 } },
      { $limit: 10 },
      { $project: { title: 1, amount: 1, category: 1, date: 1 } },
    ]);

    const totalsResult = await Expense.aggregate([
      matchStage,
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const summary = totalsResult[0] || { total: 0, count: 0 };

    const rankedCategories = categoryRankings.map((cat, i) => ({
      rank: i + 1,
      category: cat._id,
      totalAmount: Math.round(cat.totalAmount * 100) / 100,
      count: cat.count,
      avgAmount: Math.round(cat.avgAmount * 100) / 100,
      maxAmount: Math.round(cat.maxAmount * 100) / 100,
      percentage: summary.total > 0
        ? Math.round((cat.totalAmount / summary.total) * 1000) / 10
        : 0,
    }));

    const rankedTopExpenses = topExpenses.map((exp, i) => ({ ...exp, rank: i + 1 }));

    res.json({ categoryRankings: rankedCategories, topExpenses: rankedTopExpenses, summary });
  } catch (err) {
    next(err);
  }
});

router.get('/', auth, async (req, res, next) => {
  try {
    const { category, startDate, endDate, sort = 'date', order = 'desc' } = req.query;
    const filter = { userId: req.userId };

    if (category && CATEGORIES.includes(category)) filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const sortDir = order === 'asc' ? 1 : -1;
    const sortBy = sort === 'amount' ? { amount: sortDir } : { date: sortDir };

    const expenses = await Expense.find(filter).sort(sortBy).limit(500);
    res.json({ expenses });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  auth,
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('category').isIn(CATEGORIES).withMessage(`Category must be one of: ${CATEGORIES.join(', ')}`),
    body('date').optional().isISO8601().withMessage('Date must be a valid ISO 8601 date'),
    body('description').optional().isLength({ max: 500 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { title, amount, category, date, description } = req.body;
      const expense = await Expense.create({
        userId: req.userId,
        title,
        amount,
        category,
        date: date ? new Date(date) : new Date(),
        description: description || '',
      });
      console.info(`[expense-ranking] Expense created expenseId=${expense._id} userId=${req.userId}`);
      res.status(201).json({ expense });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid expense ID' } });
    }
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!expense) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Expense not found' } });
    }
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
