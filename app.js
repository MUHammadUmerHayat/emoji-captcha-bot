const { Telegraf } = require('telegraf')
const { config } = require('dotenv')
config()

const LocalSession = require('telegraf-session-local')

const { generateBtns } = require('./utils')
const { EmojiCaptcha } = require('./core')

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.use((new LocalSession({
    database: 'captcha_db.json',
    property: 'session',
    getSessionKey: (ctx) => {
        if (ctx.callbackQuery) {
            return `${ctx.callbackQuery.from.id}:${ctx.callbackQuery.message.chat.id}`
        } else if (ctx.from && ctx.chat) {
            return `${ctx.from.id}:${ctx.chat.id}`
        }
        return undefined
    }
})).middleware())

bot.use(async (ctx, next) => {
    ctx.state.captcha = Object.keys(ctx.session).length === 0 ? new EmojiCaptcha() : EmojiCaptcha.from(ctx.session)
    const result = await next()
    ctx.session = JSON.parse(JSON.stringify(ctx.state.captcha))
    return result
})

bot.on('message', async (ctx) => {

    if (ctx.state.captcha.haveFailed) {
        await ctx.reply(`You have failed the captcha.`)
    }
    else {
        await ctx.reply(
            `
Please select the emojis you see here:

${ctx.state.captcha.presentedEmojis.map(x => x.hex).join('-')}

<b>Attempts left:</b> ${ctx.state.captcha.attemptsLeft}
`,

            generateBtns(ctx.state.captcha.choices)
        )
    }
})

bot.action(/([a-fA-F0-9]{8,16})\.png/, async ctx => {
    try {
        const isCorrect = ctx.state.captcha.check(ctx.match[0])
        if (isCorrect) {
            await ctx.answerCbQuery(`✅ That's correct!`)
        }
        else {
            await ctx.editMessageText(
                `
Please select the emojis you see here:

${ctx.state.captcha.presentedEmojis.map(x => x.hex).join('-')}

<b>Attempts left:</b> ${ctx.state.captcha.attemptsLeft}
`,
                {
                    reply_markup: ctx.callbackQuery.message.reply_markup,
                    parse_mode: "HTML"
                }
            )
            await ctx.answerCbQuery(`❌ That's incorrect! focus!`)
        }
    } catch (error) {
        if (error.message == 'no attempts left') {
            await ctx.editMessageText(`You have failed the captcha.`)
        } else {
            console.error(error)
        }
    }
})

bot.launch()
