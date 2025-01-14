<template>
  <div>
    <h3>View Committee Financials</h3>
    <div v-if="dispmsg!==''" class="lead fw-bold my-1 fs-3" v-bind:class="{'text-success':!error1,'text-danger':error1}">{{dispmsg}}</div>
    <br v-else>
    <div class="row g-3 text-start">
      <div class="col-md-6">
        <label for="committeeSelect" class="form-label fw-bold">Committee</label>
        <select id="committeeSelect" class="form-select" v-model="committee" required>
          <option selected disabled value="">Select...</option>
          <option v-for="(val,com) in committeeList" v-bind:key="com" v-bind:value="com">{{val[1]}}</option>
        </select>
      </div>
      <div class="col-md-6">
        <label for="FiscalSelect" class="form-label fw-bold">Fiscal Year</label>
        <select id="FiscalSelect" class="form-select" v-model="fiscalyear" required>
          <option selected disabled value="">Select...</option>
          <option v-for="year in fiscalList" v-bind:key="year">{{year}}</option>
        </select>
      </div>
    </div>
    <br>
    <div v-if="loaded">
      <div class="row my-3 fs-5 fw-bold">
        <div class="col-md-3">Balance: <span v-bind:class="balanceWarnings">${{totalBalance.balance ? parseFloat(totalBalance.balance).toLocaleString('en-US',{minimumFractionDigits:2}) : '0.00'}}</span></div>
        <div class="col-md-3">Income: ${{totalIncome.income ? parseFloat(totalIncome.income).toLocaleString('en-US',{minimumFractionDigits:2}) : '0.00'}}</div>
        <div class="col-md-3">Spent: ${{totalSpent.spent ? parseFloat(totalSpent.spent).toLocaleString('en-US',{minimumFractionDigits:2}) : '0.00'}}</div>
        <div class="col-md-3">Budget: ${{totalBudget.budget ? parseFloat(totalBudget.budget).toLocaleString('en-US',{minimumFractionDigits:2}) : '0.00'}}</div>
      </div>

      <h4 class="mt-4">{{header}} Financial Summary</h4>
      <table class="table table-striped">
        <thead>
          <tr>
            <th>Category</th>
            <th>Spent</th>
            <th>Budget</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in financialSummary" v-bind:key="item.category">
            <td>
              {{item.category}}
              <span v-if="item.budget !== 'Approved'" class="text-danger">*</span>
              </td>
            <td>{{item.spent}}</td>
            <td>{{item.amount}}</td>
          </tr>
        </tbody>
      </table>
      <small><span class="text-danger">*</span> = Budget item not approved</small>

      <h4 class="mt-4">{{header}} Expenses</h4>
      <DataTable
        v-bind:rows="expenseTable"
        v-bind:row_key="'purchaseid'"
        v-bind:row_headers="[
          ['Purchase ID','purchaseid'],
          ['Date','date'],
          ['Item','item'],
          ['Category','category'],
          ['Vendor','vendor'],
          ['Purchaser','purchasedby'],
          ['Amount','cost'],
          ['Status','status']]"
      >
        <template v-slot:data="purchase">
          <td><router-link v-bind:to="goToItem(purchase.row.purchaseid)" class="link-primary text-decoration-none">{{purchase.row.purchaseid}}</router-link></td>
          <td>{{purchase.row.date}}</td>
          <td>{{purchase.row.item}}</td>
          <td>{{purchase.row.category}}</td>
          <td>{{purchase.row.vendor}}</td>
          <td>{{purchase.row.purchasedby}}</td>
          <td>${{purchase.row.cost}}</td>
          <td>{{purchase.row.status}}</td>
        </template>
      </DataTable>

      <h4 class="mt-4">{{header}} Income</h4>
      <DataTable
        v-bind:rows="incomeTable"
        v-bind:row_key="'incomeid'"
        v-bind:row_headers="[
          ['Date','date'],
          ['Source','source'],
          ['Type','type'],
          ['Amount','amount'],
          ['Item (if donated)','item'],
          ['Status','status'],
          ['Ref Number','refnumber']]"
      >
       <template v-slot:data="income">
          <td>{{income.row.date}}</td>
          <td>{{income.row.source}}</td>
          <td>{{income.row.type}}</td>
          <td>${{income.row.amount}}</td>
          <td>{{income.row.item}}</td>
          <td>{{income.row.status}}</td>
          <td>{{income.row.refnumber}}</td>
       </template>
      </DataTable>
    </div>
  </div>
</template>

<script>
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

import auth_state from '@/state';
import DataTable from '@/components/DataTable.vue';
import { fetchWrapperJSON } from '@/api_wrapper';


export default {
  name: "FinancialsCommittee",
  components: {
    DataTable,
  },
  data() {
    return {
      committeeList: {},
      fiscalList: [],
      committee: '',
      fiscalyear: '',
      found_comm: false,
      found_fy: false,
      error1: false,
      error2: false,
      dispmsg: '',
      totalBalance: {balance:''},
      totalBudget: {budget:''},
      totalIncome: {income:''},
      totalSpent: {spent:''},
      financialSummary: [],
      expenseTable: [],
      incomeTable: [],
    }
  },
  async mounted() {
    const committeeList = await fetchWrapperJSON(`/api/v2/account/${auth_state.state.uname}/committees`, {
      method: 'get',
      credentials: 'include',
    });

    const fiscalList = await fetchWrapperJSON(`/api/v2/budgets/years`, {
      method: 'get',
      credentials: 'include',
    });

    if (committeeList.error) {
      this.error1 = true;
      this.dispmsg = committeeList.response;
      return;
    }

    if (fiscalList.error) {
      this.error2 = true;
      this.dispmsg = fiscalList.response;
      return;
    }

    this.committeeList = committeeList.response;
    this.fiscalList = fiscalList.response;

    if (this.$route.query.comm) {
      this.found_comm = true;
      this.committee = this.$route.query.comm;
    }
    if (this.$route.query.fy) {
      this.found_fy = true;
      this.fiscalyear = this.$route.query.fy;
    }
  },
  computed: {
    loaded() {
      return this.committee !== '' && this.fiscalyear !== '';
    },
    header() {
      if (this.committee === '' || this.fiscalyear === '') {
        return '';
      }
      return `${this.fiscalyear} ${this.committeeList[this.committee][1]}`
    },
    balanceWarnings() {
      if (this.totalBalance === null || this.totalBalance === undefined) return {};
      return {'text-danger':this.totalBalance.balance<100,'text-warning':(this.totalBalance.balance<200&&this.totalBalance.balance>=100)}
    },
    comm_fy() {
      return `${this.committee}|${this.fiscalyear}`;
    }
  },
  methods: {
    goToItem(id) {
      return `/detail-view?id=${id}`;
    },
  },
  watch: {
    committee: function(newVal) {
      if (this.found_comm) {
        this.found_comm = false;
        return;
      }
      this.$router.push({path: '/financials/committee', query: {comm: newVal, fy: this.fiscalyear}});
    },
    fiscalyear: function(newVal) {
      if (this.found_fy) {
        this.found_fy = false;
        return;
      }
      this.$router.push({path: '/financials/committee', query: {comm: this.committee, fy: newVal}});
    },
    async comm_fy(newVal) {
      const committee = newVal.split('|')[0];
      const fiscalyear = newVal.split('|')[1];
      if (committee === '' || fiscalyear === '') {
        this.totalBalance = {balance:''};
        this.totalBudget = {budget:''};
        this.totalIncome = {income:''};
        this.totalSpent = {spent:''};
        this.financialSummary = [];
        this.expenseTable = [];
        this.incomeTable = [];
        return;
      }

      // First fire the requests off
      const totalBalanceP = fetchWrapperJSON(`/api/v2/committee/${committee}/balance`, {
        method: 'get',
        credentials: 'include',
      });
      const totalBudgetP = fetchWrapperJSON(`/api/v2/committee/${committee}/budget/${fiscalyear}`, {
        method: 'get',
        credentials: 'include',
      });
      const totalIncomeP = fetchWrapperJSON(`/api/v2/committee/${committee}/incometotal/${fiscalyear}`, {
        method: 'get',
        credentials: 'include',
      });
      const totalSpentP = fetchWrapperJSON(`/api/v2/committee/${committee}/expensetotal/${fiscalyear}`, {
        method: 'get',
        credentials: 'include',
      });
      const financialSummaryP = fetchWrapperJSON(`/api/v2/committee/${committee}/summary/${fiscalyear}`, {
        method: 'get',
        credentials: 'include',
      });
      const expenseTableP = fetchWrapperJSON(`/api/v2/committee/${committee}/purchases/${fiscalyear}`, {
        method: 'get',
        credentials: 'include',
      });
      const incomeTableP = fetchWrapperJSON(`/api/v2/committee/${committee}/income/${fiscalyear}`, {
        method: 'get',
        credentials: 'include',
      });

      // Then wait for them to come back
      const totalBalance = await totalBalanceP;
      const totalBudget = await totalBudgetP;
      const totalIncome = await totalIncomeP;
      const totalSpent = await totalSpentP;
      const financialSummary = await financialSummaryP;
      const expenseTable = await expenseTableP;
      const incomeTable = await incomeTableP;

      if (totalBudget.error || totalBalance.error || totalIncome.error || totalSpent.error || financialSummary.error || expenseTable.error || incomeTable.error) {
        this.totalBalance = {balance:'0.00'};
        this.totalBudget = {budget:'0.00'};
        this.totalIncome = {income:'0.00'};
        this.totalSpent = {spent:'0.00'};
        this.financialSummary = [];
        this.expenseTable = [];
        this.incomeTable = [];
        return;
      }

      this.totalBalance = totalBalance.response;
      this.totalBudget = totalBudget.response;
      this.totalIncome = totalIncome.response;
      this.totalSpent = totalSpent.response;
      this.financialSummary = financialSummary.response;
      this.expenseTable = expenseTable.response;
      this.incomeTable = incomeTable.response;
    }
  }
}
</script>
