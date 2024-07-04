import mongoose from "mongoose";

const connectDb = () => {
    return mongoose.connect(process.env.MONGO_CONNECT_STRING, {

    });
};

export default connectDb;
