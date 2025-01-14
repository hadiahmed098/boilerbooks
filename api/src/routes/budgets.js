/*
   Copyright 2022 Purdue IEEE and Hadi Ahmed

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

import { Router } from "express";
import { fiscal_year_list, committee_lut, ACCESS_LEVEL, logger, max_fiscal_year_count } from "../common_items.js";

const router = Router();

/*
    Get a list of all fiscal years
*/
router.get("/years", (req, res, next) => {
    res.status(200).send(fiscal_year_list);
    return next();
});

/*
    Create a new budget for the current fiscal year
*/
router.post("/:comm", async(req, res, next) => {
    if (!(req.params.comm in committee_lut)) {
        res.status(404).send("Invalid committee value");
        return next();
    }

    if (req.body === undefined || req.body.length === 0) {
        res.status(400).send("No budget items included");
        return next();
    }

    // First check the user has approval permissions
    try {
        const [results] = await req.context.models.account.getUserApprovals(req.context.request_user_id, committee_lut[req.params.comm][0], ACCESS_LEVEL.officer);
        if (results.length === 0) {
            res.status(404).send("Invalid committee value");
            return next();
        }
    } catch (err) {
        logger.error(err.stack);
        res.status(500).send("Internal Server Error");
        return next();
    }

    // Clear the old budget from the database
    try {
        await req.context.models.budgets.clearBudget(committee_lut[req.params.comm][0], max_fiscal_year_count);
    } catch (err) {
        logger.error(err.stack);
        res.status(500).send("Internal Server Error");
        return next();
    }

    // Add all the new line items
    try {
        for (let item of req.body) {
            if (item.category === undefined || item.amount === undefined) {
                res.status(400).send("Budget item(s) not complete");
                return next();
            }
            if (item.category === "" || item.amount === "") {
                res.status(400).send("Budget item(s) not complete");
                return next();
            }

            let budget = {
                category: item.category,
                amount: item.amount,
                committee: committee_lut[req.params.comm][0],
                year: max_fiscal_year_count,
            };

            await req.context.models.budgets.addBudget(budget);
        }
    } catch (err) {
        logger.error(err.stack);
        res.status(500).send("Internal Server Error");
        return next();
    }

    res.status(201).send("Budget submitted for approval");
    return next();
});

/*
    Update the committee budget to approved
*/
router.put("/:comm", async(req, res, next) => {
    if (!(req.params.comm in committee_lut)) {
        res.status(404).send("Invalid committee value");
        return next();
    }

    try {
        // first we make sure user is actually a treasurer
        const [results] = await req.context.models.account.getUserTreasurer(req.context.request_user_id);
        if (results.validuser === 0) {
            res.status(200).send("Approved Budget");
            return next();
        }

        await req.context.models.budgets.approveCommitteeBudget(committee_lut[req.params.comm][0], max_fiscal_year_count);

        res.status(200).send("Approved Budget");
        return next();

    } catch (err) {
        logger.error(err.stack);
        res.status(500).send("Internal Server Error");
        return next();
    }
});

/*
    Get all the submitted committee budgets
*/
router.get("/submitted", async(req, res, next) => {
    try {
        // first we make sure user is actually a treasurer
        const [results] = await req.context.models.account.getUserTreasurer(req.context.request_user_id);
        if (results.validuser === 0) {
            res.status(200).send({});
            return next();
        }

        const budgets = {};

        for (let committee in committee_lut) {
            const [results_1] = await req.context.models.budgets.getCommitteeSubmittedBudget(committee_lut[committee][0], max_fiscal_year_count);
            budgets[committee] = results_1;
        }

        res.status(200).send(budgets);
        return next();

    } catch (err) {
        logger.error(err.stack);
        res.status(500).send("Internal Server Error");
        return next();
    }
});

export default router;
