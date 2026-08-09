import { Data, sequelize } from "../Database/module.db.js";
import { Sequelize } from "sequelize";

const createFileInDb = async (req, res) => {
    const { profile_id, email } = req.user;
    const { fileName, fileType, key } = req.body;
    const transaction = await sequelize.transaction(); //Start a transaction to our database

    if (!req.body) {
        return res.status(400).json({
            okay: false,
            error: "Bad request",
            message: "You did not send file information",
        });
    }

    try {
        const sentFile = await Data.create(
            {
                owner_id: profile_id,
                creator_id: profile_id,
                creator_username: email,
                name: fileName,
                type: fileType.split("/")[1],
                metadata: {
                    key: key,
                },
            },
            { transaction: transaction }
        );

        await transaction.commit();
        res.status(201).json({
            okay: true,
            data: sentFile,
        });
    } catch (err) {
        await transaction.rollback(); //Rollback the transaction since error was thrown
        console.log(err);

        if (err instanceof Sequelize.ValidationError) {
            console.log(err.message);
            return res.status(400).json({
                okay: false,
                error: "Invalid input",
                message: err.message,
            });
        }

        res.status(500).json({
            okay: false,
            error: "Unhandled exception",
            message: "The server encountered an unexpected condition",
        });
    }
};

export { createFileInDb };
