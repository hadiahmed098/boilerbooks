import { Router } from "express";
import multer from "multer";
import * as fs from "fs/promises";
import jimp from "jimp/es";

import { committee_name_swap, mailer, logger } from "../common_items";

// filter uploaded files based on type
function fileFilter(req, file, cb) {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpg" || file.mimetype === "image/jpeg" || file.mimetype === "application/pdf" ) {
        cb(null, true);
    } else {
        cb(null, false);
    //return cb(new Error('Reciept must be a PDF, JPG, or PNG'));
    }
}
// create file upload handler
const fileHandler = multer({
    limits:{fileSize:2*1024*1024,}, // 2 MB
    dest:"/tmp/boilerbooks-tmp", // Files are just stored here while we process them
    fileFilter: fileFilter,
});

const router = Router();

/*
    Create new purchase
*/
router.post("/", async(req, res) => {
    if (req.body.committee === undefined ||
        req.body.price === undefined ||
        req.body.item === undefined ||
        req.body.vendor === undefined ||
        req.body.reason === undefined ||
        req.body.comments === undefined ||
        req.body.category === undefined) {
        return res.status(400).send("All purchase details must be completed");
    }

    if (req.body.committee === "" ||
        req.body.price === "" ||
        req.body.item === "" ||
        req.body.vendor === "" ||
        req.body.reason === "" ||
        req.body.category === "") {
        return res.status(400).send("All purchase details must be completed");
    }

    // can't escape committe so check for committee name first
    if (committee_name_swap[req.body.committee] === undefined) {
        return res.status(400).send("Committee must be proper value");
    }

    const purchase = {
        user: req.context.request_user_id,
        committee: req.body.committee,
        price: req.body.price,
        item: req.body.item,
        vendor: req.body.vendor,
        reason: req.body.reason,
        comments: req.body.comments,
        category: req.body.category,
    };

    /** Create the purchase request **/
    try {
        const [results, fields] = await req.context.models.purchase.createNewPurchase(purchase);
        if (results.affectedRows === 0) {
            return res.status(400).send("Purchase cannot be created, try again later");
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error: Purchase not created");
    }

    /** Get names of approvers and send back to user **/
    let emails = "";
    let lastID = "";
    try {
        const [results, fields_1] = await req.context.models.purchase.getLastInsertedID();
        lastID = results[0]["LAST_INSERT_ID()"];
        const [results_1, fields_2] = await req.context.models.purchase.getPurchaseApprovers(lastID);

        let names = "";
        results_1.forEach(approver => {
            names += approver.name + ", ";
            emails += approver.email + ", ";
        });
        names = names.slice(0, -2);
        emails = emails.slice(0, -2);
        res.status(201).send(`Purchase successfully submitted!\nIt can be reviewed by: ${names}`);
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error: Purchase created");
    }

    if (process.env.SEND_MAIL !== "yes") return; // SEND_MAIL must be "yes" or no mail is sent
    try {
        await mailer.sendMail({
            to: emails,
            subject: `New Purchase Request for ${purchase.committee}`,
            text: `A request was made by ${purchase.user} for ${purchase.item} costing $${purchase.price}\n` +
            "Please visit Boiler Books at your earliest convenience to approve or deny the request.\n" +
            `You always view the most up-to-date status of the purchase at https://money.purdueieee.org/ui/detail-view?id=${lastID}.\n\n` +
            "This email was automatically sent by Boiler Books",
            html: `<h2>New Purchase Request!</h2>
            <p>A request was made by ${purchase.user} for ${purchase.item} costing $${purchase.price}.</p>
            <p>Please visit <a href="https://money.purdueieee.org" target="_blank">Boiler Books</a> at your earliest convenience to approve or deny the request.</p>
            <p>You always view the most up-to-date status of the purchase <a href="https://money.purdueieee.org/ui/detail-view?id=${lastID}">here</a>.</p>
            <br>
            <small>This email was automatically sent by Boiler Books</small>`,
        });
    } catch (err) {
        logger.error(err);
    }
});

/*
    Mark purchases as 'Reimbursed' or 'Processing Reimbursement'
*/
router.post("/treasurer", async(req, res) => {
    if (req.body.status === undefined || req.body.status === "" ||
        req.body.idList === undefined || req.body.idList === "") {
        return res.status(400).send("All purchase details must be completed");
    }

    if (req.body.status !== "Processing Reimbursement" && req.body.status !== "Reimbursed") {
        return res.status(400).send("Purchase status must be 'Processing Reimbursement' or 'Reimbursed'");
    }

    if ((req.body.idList.match(/^(?:\d[,]?)+$/)).length === 0) {
        return res.status(400).send("ID list must be a comma seperated list of numbers");
    }

    // Check that user is treasurer
    try {
        const [results, fields] = await req.context.models.account.getUserTreasurer(req.context.request_user_id);
        if (results.validuser === 0) {
            return res.status(200).send("Purchase(s) updated"); // silently fail on no authorization
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    /** parse each ID **/
    const commaIDlist = req.body.idList.split(",");
    try {
        for (let id of commaIDlist) {
            /** Update the purchase **/
            const [results, fields] = await req.context.models.purchase.reimbursePurchases(id, req.body.status);
            if (results.affectedRows === 0) {
                return res.status(400).send("One or more purchase IDs are not currenty 'Purchased' or 'Processing Reimbursement'");
            }
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    res.status(201).send("Purchase(s) updated");

    /** Send email to purchasers **/
    if (process.env.SEND_MAIL !== "yes") return; // SEND_MAIL must be "yes" or no mail is sent
    try {
        for (let id of commaIDlist) {
            const [purchase_deets, fields] = await req.context.models.purchase.getFullPurchaseByID(id);
            const [user_deets, fields_1] = await req.context.models.account.getUserByID(purchase_deets[0].username);

            let text = `Your request for ${purchase_deets[0].item} is now ${purchase_deets[0].status}\n`;
            let html = `<h2>Your request for ${purchase_deets[0].item} is now ${purchase_deets[0].status}</h2>`;
            if (purchase_deets[0].status === "Reimbursed") {
                text += "Please stop by BHEE 014 to pick up your check.\n\n";
                html += "<p>Please stop by BHEE 014 to pick up your check</p>";
            } else {
                text += `You always view the most up-to-date status of the purchase at https://money.purdueieee.org/ui/detail-view?id=${purchase_deets[0].purchaseid}.\n\n`;
                html += `<p>You always view the most up-to-date status of the purchase <a href="https://money.purdueieee.org/ui/detail-view?id=${purchase_deets[0].purchaseid}">here</a>.</p>`;
            }
            text += "This email was automatically sent by Boiler Books";
            html += "<br><small>This email was automatically sent by Boiler Books</small>";

            await mailer.sendMail({
                to: user_deets[0].email,
                subject: "Purchase Status Updated!",
                text,
                html,
            });
        }
    } catch (err) {
        logger.error(err);
    }
});

/*
    Get details of a purchase
*/
router.get("/:purchaseID", async(req, res) => {

    /** get the basic params to check access control **/
    try {
        const [results, fields] = await req.context.models.purchase.getFullPurchaseByID(req.params.purchaseID);
        // No purchase found
        if (results.length === 0) {
            return res.status(404).send("Purchase not found");
        }

        const [results_1, fields_1] = await req.context.models.account.getUserApprovals(req.context.request_user_id, results[0].committee);

        // No approval powers for committee
        if (results_1.length === 0) {
            // User is purchaser
            if (req.context.request_user_id === results[0].username) {
                results[0].committee = committee_name_swap[results[0].committee];
                return res.status(200).send(results[0]);
            }
            return res.status(404).send("Purchase not found");
        }

        const [results_2, fields_2] = await req.context.models.committee.getCommitteeBalance(results[0].committee);
        results[0].costTooHigh = parseFloat(results_2[0].balance) < parseFloat(results[0].cost);
        results[0].lowBalance = parseFloat(results_2[0].balance) < 200;
        // Approval powers found
        return res.status(200).send(results[0]);

    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }
});

/*
    Cancel a purchase
*/
router.delete("/:purchaseID", async(req, res) => {
    // check that the user has approval power first
    try {
        const [results, fields] = await req.context.models.purchase.getFullPurchaseByID(req.params.purchaseID);
        // Make sure purchase exists and belongs to user
        if (results.length === 0 || results[0].username !== req.context.request_user_id) {
            return res.status(404).send("Purchase not found");
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    // Actually 'delete' the purchase
    try {
        const [results, fields] = await req.context.models.purchase.cancelPurchase(req.params.purchaseID);
        if (results.affectedRows === 0) {
            return res.status(400).send("Purchase status is not 'Requested', 'Approved', 'Purchased'");
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    return res.status(200).send("Purchase canceled");
});

/*
    Approve or Deny a purchase
*/
router.post("/:purchaseID/approve", async(req, res) => {
    if (req.body.price === undefined ||
        req.body.item === undefined ||
        req.body.vendor === undefined ||
        req.body.reason === undefined ||
        req.body.comments === undefined ||
        req.body.fundsource === undefined ||
        req.body.status ===  undefined ||
        req.body.committee === undefined) {
        return res.status(400).send("All purchase details must be completed");
    }

    if (req.body.price === "" ||
        req.body.item === "" ||
        req.body.vendor === "" ||
        req.body.reason === "" ||
        req.body.fundsource === "" ||
        req.body.status === "" ||
        req.body.committee === "") {
        return res.status(400).send("All purchase details must be completed");
    }

    if (req.body.status !== "Approved" && req.body.status !== "Denied") {
        return res.status(400).send("Purchase status must be 'Approved' or 'Denied'");
    }
    if (req.body.fundsource !== "BOSO" && req.body.fundsource !== "Cash" && req.body.fundsource !== "SOGA") {
        return res.status(400).send("Purchase funding source must be 'BOSO' or 'Cash' or 'SOGA'");
    }

    try {
        const [results, fields] = await req.context.models.purchase.getFullPurchaseByID(req.params.purchaseID);
        if (results.length === 0) {
            return res.status(404).send("Purchase not found");
        }
        if (parseFloat(req.body.price) > (parseFloat(results[0].cost) * 1.15 + 10)) {
            return res.status(400).send("Purchase cost too high");
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    // can't escape committe so check for committee name first
    req.body.committee = Object.keys(committee_name_swap).find(key => committee_name_swap[key] === req.body.committee);
    if (!(req.body.committee in committee_name_swap)) {
        return res.status(400).send("Committee must be proper value");
    }

    // check that the user has approval power first
    try {
        const [results, fields] = await req.context.models.account.getUserApprovals(req.context.request_user_id, req.body.committee);
        // No approval powers for committee
        if (results.length === 0) {
            return res.status(404).send("Purchase not found");
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    const purchase = {
        id: req.params.purchaseID,
        approver: req.context.request_user_id,
        item: req.body.item,
        vendor: req.body.vendor,
        reason: req.body.reason,
        cost: req.body.price,
        status: req.body.status,
        comments: req.body.comments,
        fundsource: req.body.fundsource,
    };

    /** update request **/
    try {
        const [results, fields] = await req.context.models.purchase.approvePurchase(purchase);
        if (results.affectedRows === 0) {
            return res.status(400).send("Purchase not in 'Requested' status");
        }
    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    res.status(201).send(`Purchase ${req.body.status}`);

    /** email requester with result **/
    if (process.env.SEND_MAIL !== "yes") return; // SEND_MAIL must be "yes" or no mail is sent
    try {
        const [purchase_deets, fields] = await req.context.models.purchase.getFullPurchaseByID(purchase.id);
        const [user_deets, fields_1] = await req.context.models.account.getUserByID(purchase_deets[0].username);
        await mailer.sendMail({
            to: user_deets[0].email,
            subject: "Purchase Status Updated!",
            text: `Your request for ${purchase_deets[0].item} was ${purchase_deets[0].status}\n` +
            "Please visit Boiler Books at your earliest convenience to complete the purchase.\n" +
            `You always view the most up-to-date status of the purchase at https://money.purdueieee.org/ui/detail-view?id=${purchase.id}.\n\n` +
            "This email was automatically sent by Boiler Books",
            html: `<h2>Your Purchase Request Was ${purchase_deets[0].status}</h2>
            <p>Your request to buy <em>${purchase_deets[0].item}</em> for <em>${purchase_deets[0].committee}</em> was ${purchase_deets[0].status}</p>
            <p>Please visit <a href="https://money.purdueieee.org" target="_blank">Boiler Books</a> at your earliest convenience to complete the request.</p>
            <p>You always view the most up-to-date status of the purchase <a href="https://money.purdueieee.org/ui/detail-view?id=${purchase.id}">here</a>.</p>
            <br>
            <small>This email was automatically sent by Boiler Books</small>`,
        });
    } catch (err) {
        logger.error(err);
    }
});

/*
    Complete a purchase
*/
router.post("/:purchaseID/complete", fileHandler.single("receipt"), async(req, res) => {
    // This catches our fileFilter filtering out files
    if (req.file === undefined) {
        return res.status(400).send("Reciept must be a PDF, JPG, or PNG");
    }

    if (req.body.price === undefined ||
        req.body.comments === undefined ||
        req.body.purchasedate === undefined) {
        fs.unlink(req.file.path);
        return res.status(400).send("All purchase details must be completed");
    }

    if (req.body.price === "" ||
        req.body.purchasedate === "") {
        fs.unlink(req.file.path);
        return res.status(400).send("All purchase details must be completed");
    }

    try {
        const [results, fields] = await req.context.models.purchase.getFullPurchaseByID(req.params.purchaseID);
        if (results.length === 0) {
            fs.unlink(req.file.path);
            return res.status(404).send("Purchase not found");
        }
        if (parseFloat(req.body.price) > (parseFloat(results[0].cost) * 1.15 + 10)) {
            fs.unlink(req.file.path);
            return res.status(400).send("Purchase cost too high, create a new request if needed");
        }
    } catch (err) {
        logger.error(err.stack);
        fs.unlink(req.file.path);
        return res.status(500).send("Internal Server Error");
    }

    // can't escape the purchasedate, so check format instead
    if ((req.body.purchasedate.match(/^\d{4}-\d{2}-\d{2}$/)).length === 0) {
        fs.unlink(req.file.path);
        return res.status(400).send("Purchase Date must be in the form YYYY-MM-DD");
    }

    /** get the basic params to check access control **/
    try {
        const [results, fields] = await req.context.models.purchase.getFullPurchaseByID(req.params.purchaseID);
        // No purchase found
        if (results.length === 0) {
            fs.unlink(req.file.path);
            return res.status(404).send("Purchase not found");
        }
        // User is not purchaser
        if (req.context.request_user_id !== results[0].username) {
            fs.unlink(req.file.path);
            return res.status(400).send("Purchase not found");
        }

        /** setup file and remove the temp **/
        const fileType = req.file.mimetype.split("/")[1]; // dirty hack to get the file type from the MIME type

        let file_save_name = "";
        if (fileType === "png") {
            // BOSO only allows PDF and JPG, so handle png differently
            file_save_name = `${results[0].committee}_${results[0].username}_${results[0].item}_${results[0].purchaseid}.jpg`;
        } else {
            // handle JPG / JPEG / PDF like normal
            file_save_name = `${results[0].committee}_${results[0].username}_${results[0].item}_${results[0].purchaseid}.${fileType}`;
        }
        file_save_name = file_save_name.replaceAll(" ", "_");
        file_save_name = file_save_name.replaceAll(/['"!?#%&{}/<>$:@+`|=]/ig, "");
        file_save_name = "/receipt/".concat("", file_save_name);

        // check if the file already exists
        try {
            const stats = await fs.stat(file_save_name);
            if (stats.isFile()) {
                fs.unlink(req.file.path);
                return res.status(500).send("Receipt file already exists");
            }
        } catch (err) {
            // File doesn't exist, so just continue
        }

        if (fileType === "png") {
            const img = await jimp.read(req.file.path);
            img.write(process.env.RECEIPT_BASEDIR+file_save_name);
        } else {
            await fs.rename(req.file.path, process.env.RECEIPT_BASEDIR+file_save_name);
        }

        const purchase = {
            id: req.params.purchaseID,
            purchasedate: req.body.purchasedate,
            cost: req.body.price,
            comments: req.body.comments,
            receipt: file_save_name,
        };

        const [results_1, fields_1] = await req.context.models.purchase.completePurchase(purchase);

    } catch (err) {
        logger.error(err.stack);
        return res.status(500).send("Internal Server Error");
    }

    /** send email to treasurer **/
    if (process.env.SEND_MAIL !== "yes") return; // SEND_MAIL must be "yes" or no mail is sent
    try {
        const [purchase_deets, fields] = await req.context.models.purchase.getFullPurchaseByID(req.params.purchaseID);
        await mailer.sendMail({
            to:  "purdue.ieee.treasurer@gmail.com",
            subject: `New Purchase By ${purchase_deets[0].committee}`,
            text: `${purchase_deets[0].committee} has just purchased ${purchase_deets[0].item} for $${purchase_deets[0].cost}.\n` +
            "Please visit Boiler Books at your earliest convenience to begin the reimbursement process.\n" +
            `You always view the most up-to-date status of the purchase at https://money.purdueieee.org/ui/detail-view?id=${req.params.purchaseID}.\n\n` +
            "This email was automatically sent by Boiler Books",
            html: `<p>${purchase_deets[0].committee} has purchased ${purchase_deets[0].item} for $${purchase_deets[0].cost}</p>
            <p>Please visit <a href="https://money.purdueieee.org" target="_blank">Boiler Books</a> at your earliest convenience to begin the reimbursement process.</p>
            <p>You always view the most up-to-date status of the purchase <a href="https://money.purdueieee.org/ui/detail-view?id=${req.params.purchaseID}">here</a>.</p>
            <br>
            <small>This email was automatically sent by Boiler Books</small>`,
        });
    } catch (err) {
        logger.error(err);
    }

    return res.status(201).send("Purchase completed");
}, (err, req, res, next) => {
    // This catches too large files
    res.status(400).send("Reciept must be less than 2MB");
});

export default router;
