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

import { db_conn } from "./index.js";
import { current_fiscal_year } from "../common_items.js";

async function getCommitteeCategories(comm) {
    return db_conn.promise().execute(
        "SELECT category FROM Budget WHERE committee=? AND year=? AND status='Approved'",
        [comm, current_fiscal_year]
    );
}

async function getCommitteeBalance(comm) {
    return db_conn.promise().execute(
        `SELECT (SELECT SUM(amount) AS income FROM Income
        WHERE type in ('BOSO', 'Cash', 'SOGA') AND committee = ? AND status = ?)
        -
        (SELECT SUM(Purchases.cost) AS spend FROM Purchases
        WHERE Purchases.committee = ? AND Purchases.status IN ('Purchased','Processing Reimbursement','Reimbursed','Approved',NULL)) AS balance`,
        [comm, "Received", comm]
    );
}

async function getCommitteeBudgetTotals(comm, year) {
    return db_conn.promise().execute(
        "SELECT SUM(Budget.amount) AS budget FROM Budget WHERE Budget.committee = ? AND Budget.year = ? AND status='Approved'",
        [comm, year]
    );
}

async function getCommitteeExpenseTotals(comm, year) {
    return db_conn.promise().execute(
        `SELECT SUM(Purchases.cost) AS spent FROM Purchases
		WHERE Purchases.committee = ? AND Purchases.status in ('Purchased','Processing Reimbursement','Reimbursed', 'Approved', NULL)
		AND Purchases.fiscalyear = ?`,
        [comm, year]
    );
}

async function getCommitteeIncomeTotals(comm, year) {
    return db_conn.promise().execute(
        `SELECT SUM(amount) AS income FROM Income
		WHERE type in ('BOSO', 'Cash', 'SOGA') AND committee = ? AND status = 'Received'
		AND fiscalyear = ?`,
        [comm, year]
    );
}

async function getCommitteePurchases(comm, year) {
    return db_conn.promise().execute(
        `SELECT p.purchaseid, DATE_FORMAT(p.purchasedate,'%m/%d/%Y') as date, p.item, p.purchasereason, p.vendor, p.committee, p.category, p.receipt, p.status,
		p.cost, p.comments,
        (SELECT CONCAT(U.first, ' ', U.last) FROM Users U WHERE U.username = p.username) purchasedby,
		(SELECT CONCAT(U.first, ' ', U.last) FROM Users U WHERE U.username = p.approvedby) approvedby
		FROM Purchases p
		WHERE p.committee = ? AND p.fiscalyear = ? AND p.status != 'Denied'`,
        [comm, year]
    );
}

async function getCommitteeIncome(comm, year) {
    return db_conn.promise().execute(
        `SELECT *, DATE_FORMAT(updated,'%m/%d/%Y') as date, I.amount as income_amount
		FROM Income I
		WHERE I.committee = ?
		AND I.fiscalyear = ?
		ORDER BY I.updated`,
        [comm, year]
    );
}

async function getCommitteeBudgetSummary(comm, year) {
    return db_conn.promise().execute(
        `SELECT B.category, SUM(CASE WHEN (P.status in ('Purchased','Processing Reimbursement','Reimbursed', 'Approved', NULL) AND (P.committee = ?) AND (P.fiscalyear = ?)) THEN P.cost ELSE 0 END) AS spent,
        B.amount, B.status AS budget FROM Budget B
		LEFT JOIN Purchases P ON B.category = P.category
		WHERE B.committee = ?
		AND B.year = ?
		GROUP BY B.category, B.amount, B.status`,
        [comm, year, comm, year]
    );
}

export default {
    getCommitteeCategories,
    getCommitteeBalance,
    getCommitteeBudgetTotals,
    getCommitteeExpenseTotals,
    getCommitteeIncomeTotals,
    getCommitteePurchases,
    getCommitteeIncome,
    getCommitteeBudgetSummary,
};