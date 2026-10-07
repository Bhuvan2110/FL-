import app from '../server/app'

// Express apps are directly callable as (req, res) => void, which is the
// exact contract Vercel's Node.js runtime expects from a default export —
// no adapter library needed.
export default app
