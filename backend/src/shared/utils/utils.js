const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')

const JWT_SECRET = process.env.JWT_SECRET || 'blackjack-secret-key'

const validateToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const prisma = new PrismaClient()
    
    // Check if user still exists in database
    const user = await prisma.player.findUnique({
      where: { id: decoded.userId }
    })
    
    await prisma.$disconnect()
    
    if (!user) {
      return { valid: false, error: 'User not found' }
    }
    
    return {
      valid: true,
      userId: user.id,
      username: user.username,
      balance: user.balance
    }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

module.exports = { validateToken }