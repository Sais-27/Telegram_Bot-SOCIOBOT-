import dotenv from 'dotenv';
dotenv.config();
import { Telegraf } from "telegraf";
import User from './src/models/User.js';
import {message} from 'telegraf/filters';
import connectDb from './src/config/db.js';
import eventModel from './src/models/Event.js';
import OpenAI from "openai";
const openai = new OpenAI({
    apiKey: process.env['OPENAI_KEY'],
});


const bot = new Telegraf(process.env.BOT_TOKEN);

(async () => {
    try {
        await connectDb();
        console.log('connected to db');
    } catch (err) {
        console.log(err);
        process.kill(process.pid, 'SIGTERM');
    }
})();

bot.start(async (ctx) => {
    const from = ctx.update.message.from;
    console.log('from', from);
    try {
        await User.findOneAndUpdate({ tgId: from.id }, {
            $setOnInsert: {
                firstName: from.first_name,
                lastName: from.last_name,
                isBot: from.is_bot,
                username: from.username,
            }
        }, {
            upsert: true,
            new: true
        });
        await ctx.reply(`Hey! ${from.first_name}, Welcome. I will be writing highly engaging social media posts for you 🚀. Just keep feeding me with the events throughout the day. Let's shine on social media🌟`);
    } catch (err) {
        console.log(err);
        await ctx.reply(`Facing Difficulties`);
    }
});

bot.command('generate', async(ctx)=> {
    const from = ctx.update.message.from;
    const{message_id:waitingMessageId}=await ctx.reply(
        `Hey! ${from.first_name}, kindly wait for a moment I am curating posts for you⏳`
    )
    const{message_id:loadingStickerMsgId}=await ctx.replyWithSticker(
        'CAACAgIAAxkBAAN9Zoargnk9JI2lPpMontNED8X0tYgAAgUAA8A2TxP5al-agmtNdTUE'
    )
    const startOfDay=new Date();
    startOfDay.setHours(0,0,0,0);
    const endOfDay=new Date();
    endOfDay.setHours(23,59,59,999);

    //get events for the user
    const events=await eventModel.find({
        tgId:from.id,
        createdAt:{
            $gte:startOfDay,
            $lte:endOfDay,
        },
    });
    if(events.length===0){
        await ctx.deleteMessage(waitingMessageId);
        await ctx.deleteMessage(loadingStickerMsgId);
        await ctx.reply('You have not entered any events yet. Please enter the events and then try again');
        return;
    }
    console.log('events',events);

    //make openai API call
    try{
        const chatCompletion=await openai.chat.completions.create({
            messages:[
                {
                    role:'system',
                    content:'Act as a senior copywriter, you write highly engaging posts in LinkedIn, facebook and twitter using provided thoughts/events through out day',
                },
                {
                    role:'user',
                    content:`write like a human,for humans.Craft three engaging social media posts tailored for linkedin,Facebook, and twitter audiences.use simple languages.Use given time labels just to understand the order of the events,don't mention the time in the posts.Each posts should cretively highlight the following events.Ensure the tone is conversational and impactful .Focus on engaging the respective platform's audienc, encouraging interaction and driving interest in the events.
                ${events.map((event)=>event.text).join(',')}
                `,
                },
            ],
            model:process.env.OPENAI_MODEL,
        });
        console.log('Completion',chatCompletion);

        await User.findOneAndUpdate({
            tgId:from.id,
        },{
            $inc:{
                promptTokens:chatCompletion.usage.prompt_tokens,
                completionTokens:chatCompletion.usage.completion_tokens,
            }
        }
    );
    await ctx.deleteMessage(waitingMessageId);
    await ctx.deleteMessage(loadingStickerMsgId);
    await ctx.reply(chatCompletion.choices[0].message.content);
    }
    catch(err){
        console.error('Error during OpenAI API call:', err);
        await ctx.reply(`Facing Difficulties,Please try again later`);
        return;
    }
    //send response
})

bot.help((ctx)=>{
    ctx.reply('For support contact @sankatmochansai')
});
// bot.on(message('sticker'),(ctx)=>{
//     console.log('sticker',ctx.update.message);
// })
bot.on(message('text'),async(ctx)=> {
    const from = ctx.update.message.from;
    const message = ctx.update.message.text;
    try {
        await eventModel.create({
            text: message,
            tgId: from.id,
        })
        await ctx.reply('Noted👍,Keep texting me your thoughts. To generate the posts,just enter the command: /generate');
    }
    catch (err) {
        console.log(err);
        await ctx.reply(`Facing Difficulties,Please try again later`);
    }
})
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
