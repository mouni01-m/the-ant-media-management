"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Filter,
  Loader2,
  Target,
  TrendingUp,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

type UserRecord = {
  id: string;
  name?: string;
  email?: string;
  role?: "founder" | "employee" | "intern" | string;
  department?: string;
  active?: boolean;
};

type TaskRecord = {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  assignedToName?: string;
  department?: string;
  clientName?: string;
  deadline?: string;
  deadlineTime?: string;
  startDate?: string;
  createdAt?: Timestamp | Date | string | null;
  updatedAt?: Timestamp | Date | string | null;
  completedAt?: Timestamp | Date | string | null;
};

type Period = "today" | "week" | "month";

const normalizeStatus = (status?: string) =>
  (status || "").trim().toUpperCase().replace(/_/g, " ");

const statusLabel = (status?: string) => {
  switch (normalizeStatus(status)) {
    case "TODO":
      return "To Do";
    case "IN PROGRESS":
      return "In Progress";
    case "SUBMITTED":
    case "REVIEW":
      return "Submitted";
    case "APPROVED":
      return "Approved";
    case "COMPLETED":
      return "Completed";
    case "CHANGES REQUESTED":
      return "Changes Requested";
    default:
      return status || "Unknown";
  }
};

const isCompleted = (task: TaskRecord) =>
  normalizeStatus(task.status) === "COMPLETED";

const isActive = (task: TaskRecord) =>
  !["COMPLETED", "APPROVED"].includes(normalizeStatus(task.status));

const getToday = () => {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
};

const getPeriodStart = (period: Period) => {
  const today = getToday();

  if (period === "today") {
    return today;
  }

  if (period === "week") {
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;

    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + diff
    );
  }

  return new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  );
};

const getPeriodEnd = (period: Period) => {
  const today = getToday();

  if (period === "today") {
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999
    );
  }

  if (period === "week") {
    const day = today.getDay();
    const daysUntilSunday = day === 0 ? 0 : 7 - day;

    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + daysUntilSunday,
      23,
      59,
      59,
      999
    );
  }

  return new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
};

const dateOnly = (value?: string | null) => {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? null
      : date;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "seconds" in value &&
    typeof (value as { seconds?: unknown }).seconds ===
      "number"
  ) {
    return new Date(
      (value as { seconds: number }).seconds * 1000
    );
  }

  return null;
};

const getDeadlineDate = (task: TaskRecord) => {
  if (!task.deadline) {
    return null;
  }

  const value = task.deadlineTime
    ? `${task.deadline}T${task.deadlineTime}`
    : `${task.deadline}T23:59:59`;

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
};

const isOverdue = (task: TaskRecord) => {
  const deadline = getDeadlineDate(task);

  if (!deadline || isCompleted(task)) {
    return false;
  }

  return deadline.getTime() < Date.now();
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "No deadline";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function FounderReportsPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);

  const [period, setPeriod] =
    useState<Period>("month");

  const [roleFilter, setRoleFilter] = useState<
    "all" | "employee" | "intern"
  >("all");

  const [departmentFilter, setDepartmentFilter] =
    useState("all");

  useEffect(() => {
    let unsubscribeUsers:
      | (() => void)
      | null = null;

    let unsubscribeTasks:
      | (() => void)
      | null = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribeUsers?.();
        unsubscribeTasks?.();

        unsubscribeUsers = null;
        unsubscribeTasks = null;

        if (!user) {
          setAuthorized(false);
          setUsers([]);
          setTasks([]);
          setLoading(false);
          return;
        }

        setLoading(true);

        unsubscribeUsers = onSnapshot(
          collection(db, "users"),
          (snapshot) => {
            const usersData = snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...(item.data() as Omit<
                  UserRecord,
                  "id"
                >),
              })
            );

            const currentUser = usersData.find(
              (item) => item.id === user.uid
            );

            const currentRole = String(
              currentUser?.role || ""
            )
              .trim()
              .toLowerCase();

            if (currentRole !== "founder") {
              setAuthorized(false);
              setUsers([]);
              setTasks([]);
              setLoading(false);
              return;
            }

            setAuthorized(true);
            setUsers(usersData);
          },
          (error) => {
            console.error(
              "Founder reports users listener error:",
              error
            );

            setAuthorized(false);
            setUsers([]);
            setLoading(false);
          }
        );

        unsubscribeTasks = onSnapshot(
          collection(db, "tasks"),
          (snapshot) => {
            const taskData = snapshot.docs.map(
              (item) => ({
                id: item.id,
                ...(item.data() as Omit<
                  TaskRecord,
                  "id"
                >),
              })
            );

            setTasks(taskData);
            setLoading(false);
          },
          (error) => {
            console.error(
              "Founder reports tasks listener error:",
              error
            );

            setTasks([]);
            setLoading(false);
          }
        );
      }
    );

    return () => {
      unsubscribeUsers?.();
      unsubscribeTasks?.();
      unsubscribeAuth();
    };
  }, []);

  const teamMembers = useMemo(
    () =>
      users.filter(
        (user) =>
          (user.role === "employee" ||
            user.role === "intern") &&
          user.active === true
      ),
    [users]
  );

  const departments = useMemo(() => {
    const values = teamMembers
      .map((user) => user.department)
      .filter(Boolean) as string[];

    return Array.from(
      new Set(values)
    ).sort();
  }, [teamMembers]);

  const filteredTasks = useMemo(() => {
    const start = getPeriodStart(period);
    const end = getPeriodEnd(period);

    return tasks.filter((task) => {
      const assignedMember = teamMembers.find(
        (user) => user.id === task.assignedTo
      );

      if (
        roleFilter !== "all" &&
        assignedMember?.role !== roleFilter
      ) {
        return false;
      }

      const department =
        task.department ||
        assignedMember?.department ||
        "";

      if (
        departmentFilter !== "all" &&
        department !== departmentFilter
      ) {
        return false;
      }

      const taskDate =
        dateOnly(task.startDate) ||
        dateOnly(task.deadline) ||
        toDate(task.createdAt);

      if (!taskDate) {
        return false;
      }

      return (
        taskDate.getTime() >= start.getTime() &&
        taskDate.getTime() <= end.getTime()
      );
    });
  }, [
    tasks,
    teamMembers,
    period,
    roleFilter,
    departmentFilter,
  ]);

  const totalTasks = filteredTasks.length;

  const completedTasks =
    filteredTasks.filter(isCompleted);

  const activeTasks =
    filteredTasks.filter(isActive);

  const overdueTasks =
    filteredTasks.filter(isOverdue);

  const completionRate =
    totalTasks === 0
      ? 0
      : Math.round(
          (completedTasks.length / totalTasks) * 100
        );

  const memberWorkload = useMemo(() => {
    return teamMembers
      .filter(
        (member) =>
          roleFilter === "all" ||
          member.role === roleFilter
      )
      .filter(
        (member) =>
          departmentFilter === "all" ||
          member.department === departmentFilter
      )
      .map((member) => {
        const memberTasks = filteredTasks.filter(
          (task) =>
            task.assignedTo === member.id
        );

        const active =
          memberTasks.filter(isActive);

        const completed =
          memberTasks.filter(isCompleted);

        const overdue =
          memberTasks.filter(isOverdue);

        const workload =
          active.length === 0
            ? 0
            : Math.min(100, active.length * 20);

        return {
          ...member,
          total: memberTasks.length,
          active: active.length,
          completed: completed.length,
          overdue: overdue.length,
          workload,
        };
      })
      .sort(
        (a, b) => b.active - a.active
      );
  }, [
    teamMembers,
    filteredTasks,
    roleFilter,
    departmentFilter,
  ]);

  const departmentWorkload = useMemo(() => {
    const map = new Map<
      string,
      {
        department: string;
        total: number;
        active: number;
        completed: number;
        overdue: number;
      }
    >();

    filteredTasks.forEach((task) => {
      const member = teamMembers.find(
        (user) => user.id === task.assignedTo
      );

      const department =
        task.department ||
        member?.department ||
        "Unassigned";

      const existing = map.get(
        department
      ) || {
        department,
        total: 0,
        active: 0,
        completed: 0,
        overdue: 0,
      };

      existing.total += 1;

      if (isActive(task)) {
        existing.active += 1;
      }

      if (isCompleted(task)) {
        existing.completed += 1;
      }

      if (isOverdue(task)) {
        existing.overdue += 1;
      }

      map.set(department, existing);
    });

    return Array.from(map.values()).sort(
      (a, b) => b.active - a.active
    );
  }, [filteredTasks, teamMembers]);

  const highestWorkload = memberWorkload[0];

  const workloadInsights = useMemo(() => {
    const insights: {
      tone: "red" | "amber" | "blue" | "emerald";
      title: string;
      detail: string;
    }[] = [];

    if (memberWorkload.length === 0) {
      return insights;
    }

    const averageActive =
      memberWorkload.reduce((sum, member) => sum + member.active, 0) /
      memberWorkload.length;

    const overloaded = memberWorkload.filter(
      (member) => member.active >= 5 || member.active > averageActive * 1.75
    );

    if (overloaded.length > 0) {
      const names = overloaded
        .slice(0, 3)
        .map((member) => member.name || member.email || "Unnamed member")
        .join(", ");

      insights.push({
        tone: "red",
        title: "High workload detected",
        detail: `${names} ${overloaded.length === 1 ? "has" : "have"} a high number of active tasks. Consider reviewing task distribution.`,
      });
    } else {
      insights.push({
        tone: "emerald",
        title: "Workload is balanced",
        detail: "No team member crosses the current workload pressure threshold for this report.",
      });
    }

    const today = getToday();
    const dueToday = filteredTasks.filter((task) => {
      const deadline = dateOnly(task.deadline);
      return (
        deadline !== null &&
        deadline.getTime() === today.getTime() &&
        !isCompleted(task)
      );
    });

    if (dueToday.length > 0) {
      insights.push({
        tone: "amber",
        title: "Deadline pressure",
        detail: `${dueToday.length} ${dueToday.length === 1 ? "task is" : "tasks are"} due today and still ${dueToday.length === 1 ? "needs" : "need"} attention.`,
      });
    } else {
      insights.push({
        tone: "emerald",
        title: "Today's deadlines",
        detail: "No incomplete tasks are due today in the selected report scope.",
      });
    }

    if (overdueTasks.length > 0) {
      const overdueByMember = new Map<string, number>();

      overdueTasks.forEach((task) => {
        const key =
          task.assignedToName ||
          teamMembers.find((member) => member.id === task.assignedTo)?.name ||
          "Unassigned";

        overdueByMember.set(key, (overdueByMember.get(key) || 0) + 1);
      });

      const topOverdue = Array.from(overdueByMember.entries()).sort(
        (a, b) => b[1] - a[1]
      )[0];

      insights.push({
        tone: "red",
        title: "Overdue concentration",
        detail: topOverdue
          ? `${topOverdue[0]} accounts for ${topOverdue[1]} overdue ${topOverdue[1] === 1 ? "task" : "tasks"} in this scope.`
          : `${overdueTasks.length} overdue tasks require attention.`,
      });
    } else {
      insights.push({
        tone: "emerald",
        title: "Overdue status",
        detail: "No overdue tasks were found in the selected report scope.",
      });
    }

    const roleStats = ["employee", "intern"].map((role) => {
      const roleMembers = memberWorkload.filter(
        (member) => member.role === role
      );

      return {
        role,
        active: roleMembers.reduce((sum, member) => sum + member.active, 0),
      };
    });

    const employeeActive = roleStats.find(
      (item) => item.role === "employee"
    )?.active || 0;
    const internActive =
      roleStats.find((item) => item.role === "intern")?.active || 0;

    if (employeeActive + internActive > 0) {
      const heavierRole =
        employeeActive >= internActive ? "Employees" : "Interns";
      const heavierCount = Math.max(employeeActive, internActive);

      insights.push({
        tone: "blue",
        title: "Role workload distribution",
        detail: `${heavierRole} currently carry the larger share of active tasks (${heavierCount}). Use the role filter to inspect the split.`,
      });
    }

    const busiestDepartment = departmentWorkload[0];

    if (busiestDepartment) {
      insights.push({
        tone: "blue",
        title: "Department pressure",
        detail: `${busiestDepartment.department} has the highest active-task count at ${busiestDepartment.active}.`,
      });
    }

    if (completionRate >= 80 && totalTasks > 0) {
      insights.push({
        tone: "emerald",
        title: "Strong completion",
        detail: `${completionRate}% of tasks in this report scope are completed.`,
      });
    } else if (completionRate < 50 && totalTasks > 0) {
      insights.push({
        tone: "amber",
        title: "Completion needs attention",
        detail: `Only ${completionRate}% of tasks in this report scope are completed. Review active and overdue work.`,
      });
    }

    return insights;
  }, [
    memberWorkload,
    filteredTasks,
    overdueTasks,
    teamMembers,
    departmentWorkload,
    completionRate,
    totalTasks,
  ]);

  const roleWorkload = useMemo(() => {
    return ["employee", "intern"].map((role) => {
      const members = memberWorkload.filter(
        (member) => member.role === role
      );

      return {
        role,
        members: members.length,
        total: members.reduce((sum, member) => sum + member.total, 0),
        active: members.reduce((sum, member) => sum + member.active, 0),
        completed: members.reduce(
          (sum, member) => sum + member.completed,
          0
        ),
        overdue: members.reduce((sum, member) => sum + member.overdue, 0),
      };
    });
  }, [memberWorkload]);

  const maxRoleActive = Math.max(
    1,
    ...roleWorkload.map((item) => item.active)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070d] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/60">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading reports...
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#07070d] text-white flex items-center justify-center px-6">
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />

          <h1 className="text-xl font-semibold">
            Founder access required
          </h1>

          <p className="text-white/50 mt-2">
            You do not have permission to view
            reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#07070d] text-white overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />

        <div className="absolute top-40 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-[1500px] mx-auto px-5 sm:px-8 py-8">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-8">
          <div>
            <button
              onClick={() =>
                (window.location.href =
                  "/founder")
              }
              className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Founder Dashboard
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-violet-300" />
              </div>

              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Founder Reports
                </h1>

                <p className="text-white/45 mt-1">
                  Live performance, workload and
                  task analytics.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "Today"],
                ["week", "This Week"],
                ["month", "This Month"],
              ] as [Period, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setPeriod(value)
                }
                className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                  period === value
                    ? "bg-white text-black border-white"
                    : "bg-white/[0.04] text-white/60 border-white/10 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* FILTERS */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-4 mb-6">
          <div className="flex items-center gap-2 text-sm font-semibold mb-4">
            <Filter className="w-4 h-4 text-violet-300" />
            Report Filters
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(
                  event.target.value as
                    | "all"
                    | "employee"
                    | "intern"
                )
              }
              className="bg-[#11111a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none"
            >
              <option value="all">
                All Team Members
              </option>

              <option value="employee">
                Employees Only
              </option>

              <option value="intern">
                Interns Only
              </option>
            </select>

            <select
              value={departmentFilter}
              onChange={(event) =>
                setDepartmentFilter(
                  event.target.value
                )
              }
              className="bg-[#11111a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none"
            >
              <option value="all">
                All Departments
              </option>

              {departments.map(
                (department) => (
                  <option
                    key={department}
                    value={department}
                  >
                    {department}
                  </option>
                )
              )}
            </select>
          </div>
        </section>

        {/* KPI CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={
              <Target className="w-5 h-5" />
            }
            label="Total Tasks"
            value={totalTasks}
            description="Tasks in selected period"
          />

          <MetricCard
            icon={
              <Activity className="w-5 h-5" />
            }
            label="Active Tasks"
            value={activeTasks.length}
            description="Currently active"
          />

          <MetricCard
            icon={
              <AlertTriangle className="w-5 h-5" />
            }
            label="Overdue"
            value={overdueTasks.length}
            description="Past their deadline"
          />

          <MetricCard
            icon={
              <TrendingUp className="w-5 h-5" />
            }
            label="Completion Rate"
            value={`${completionRate}%`}
            description={`${completedTasks.length} completed`}
          />
        </section>

        {/* TEAM WORKLOAD */}
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
          <div className="xl:col-span-2 rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-white/40">
                  Team Workload
                </p>

                <h2 className="text-xl font-semibold mt-1">
                  People & Active Tasks
                </h2>
              </div>

              <Users className="w-5 h-5 text-white/30" />
            </div>

            {memberWorkload.length ===
            0 ? (
              <EmptyState text="No team workload data for this filter." />
            ) : (
              <div className="space-y-4">
                {memberWorkload.map(
                  (member) => (
                    <div
                      key={member.id}
                      className="rounded-2xl bg-white/[0.025] border border-white/5 p-4"
                    >
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center shrink-0">
                            <UserRound className="w-4 h-4 text-violet-300" />
                          </div>

                          <div className="min-w-0">
                            <p className="font-medium truncate">
                              {member.name ||
                                member.email ||
                                "Unnamed member"}
                            </p>

                            <p className="text-xs text-white/35 capitalize">
                              {member.role} •{" "}
                              {member.department ||
                                "No department"}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="font-semibold">
                            {member.active}
                          </p>

                          <p className="text-[11px] text-white/35">
                            active
                          </p>
                        </div>
                      </div>

                      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all"
                          style={{
                            width: `${member.workload}%`,
                          }}
                        />
                      </div>

                      <div className="flex justify-between mt-3 text-xs text-white/40">
                        <span>
                          {member.completed}{" "}
                          completed
                        </span>

                        <span>
                          {member.overdue}{" "}
                          overdue
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* HIGHEST WORKLOAD */}
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/[0.10] to-blue-500/[0.05] backdrop-blur-xl p-6">
            <p className="text-sm text-white/40">
              Highest Active Workload
            </p>

            {highestWorkload ? (
              <>
                <div className="mt-5 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                    <UserRound className="w-6 h-6 text-violet-200" />
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold truncate">
                      {highestWorkload.name ||
                        highestWorkload.email ||
                        "Unnamed member"}
                    </h2>

                    <p className="text-sm text-white/40 capitalize">
                      {highestWorkload.role}
                    </p>
                  </div>
                </div>

                <div className="mt-8">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-white/45">
                      Active tasks
                    </span>

                    <span className="font-semibold">
                      {
                        highestWorkload.active
                      }
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
                      style={{
                        width: `${highestWorkload.workload}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <MiniStat
                    label="Completed"
                    value={
                      highestWorkload.completed
                    }
                  />

                  <MiniStat
                    label="Overdue"
                    value={
                      highestWorkload.overdue
                    }
                  />
                </div>
              </>
            ) : (
              <EmptyState text="No workload data available." />
            )}
          </div>
        </section>

        {/* DEPARTMENT WORKLOAD */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-white/40">
                Department Analysis
              </p>

              <h2 className="text-xl font-semibold mt-1">
                Workload by Department
              </h2>
            </div>

            <BarChart3 className="w-5 h-5 text-white/30" />
          </div>

          {departmentWorkload.length ===
          0 ? (
            <EmptyState text="No department data available." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {departmentWorkload.map(
                (department) => (
                  <div
                    key={
                      department.department
                    }
                    className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-medium capitalize truncate">
                        {
                          department.department
                        }
                      </h3>

                      <span className="text-xs text-white/30">
                        {department.total}{" "}
                        tasks
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-5">
                      <MiniStat
                        label="Active"
                        value={
                          department.active
                        }
                      />

                      <MiniStat
                        label="Done"
                        value={
                          department.completed
                        }
                      />

                      <MiniStat
                        label="Late"
                        value={
                          department.overdue
                        }
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* WORKLOAD INSIGHTS */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-6">
            <div>
              <p className="text-sm text-white/40">Founder Intelligence</p>
              <h2 className="text-xl font-semibold mt-1">
                Workload Insights
              </h2>
              <p className="text-sm text-white/35 mt-1">
                Data-driven signals from the selected task period and filters.
              </p>
            </div>

            <div className="rounded-2xl border border-violet-400/10 bg-violet-500/[0.06] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-white/30">
                Active workload
              </p>
              <p className="text-xl font-semibold mt-1">
                {activeTasks.length}
              </p>
            </div>
          </div>

          {workloadInsights.length === 0 ? (
            <EmptyState text="No workload insights available for this filter." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {workloadInsights.map((insight, index) => (
                <InsightCard
                  key={`${insight.title}-${index}`}
                  tone={insight.tone}
                  title={insight.title}
                  detail={insight.detail}
                />
              ))}
            </div>
          )}
        </section>

        {/* ROLE WORKLOAD */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-white/40">Role Analysis</p>
              <h2 className="text-xl font-semibold mt-1">
                Employee vs Intern Workload
              </h2>
            </div>
            <Users className="w-5 h-5 text-white/30" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roleWorkload.map((item) => (
              <div
                key={item.role}
                className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium capitalize">{item.role}s</h3>
                  <span className="text-xs text-white/30">
                    {item.members} members
                  </span>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs text-white/40 mb-2">
                    <span>Active tasks</span>
                    <span className="text-white/70">{item.active}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (item.active / maxRoleActive) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-5">
                  <MiniStat label="Total" value={item.total} />
                  <MiniStat label="Done" value={item.completed} />
                  <MiniStat label="Late" value={item.overdue} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* OVERDUE TASKS */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-white/40">
                Attention Required
              </p>

              <h2 className="text-xl font-semibold mt-1">
                Overdue Tasks
              </h2>
            </div>

            <Clock3 className="w-5 h-5 text-white/30" />
          </div>

          {overdueTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400/70 mb-3" />

              <p className="font-medium">
                No overdue tasks
              </p>

              <p className="text-sm text-white/35 mt-1">
                Everything is within deadline
                for this period.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...overdueTasks]
                .sort((a, b) => {
                  const dateA =
                    getDeadlineDate(
                      a
                    )?.getTime() || 0;

                  const dateB =
                    getDeadlineDate(
                      b
                    )?.getTime() || 0;

                  return dateA - dateB;
                })
                .map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-2xl border border-red-500/10 bg-red-500/[0.035] p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />

                        <h3 className="font-medium truncate">
                          {task.title ||
                            "Untitled task"}
                        </h3>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/35">
                        <span>
                          Assigned to:{" "}
                          {task.assignedToName ||
                            teamMembers.find(
                              (user) =>
                                user.id ===
                                task.assignedTo
                            )?.name ||
                            "Unassigned"}
                        </span>

                        <span>
                          Status:{" "}
                          {statusLabel(
                            task.status
                          )}
                        </span>

                        {task.clientName && (
                          <span>
                            Client:{" "}
                            {task.clientName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left md:text-right shrink-0">
                      <p className="text-sm font-medium text-red-300">
                        {formatDate(
                          task.deadline
                        )}
                      </p>

                      {task.deadlineTime && (
                        <p className="text-xs text-white/30 mt-1">
                          {
                            task.deadlineTime
                          }
                        </p>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-5">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/5 flex items-center justify-center text-violet-300">
          {icon}
        </div>
      </div>

      <p className="text-sm text-white/40 mt-5">
        {label}
      </p>

      <p className="text-3xl font-bold mt-1">
        {value}
      </p>

      <p className="text-xs text-white/30 mt-2">
        {description}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-white/[0.035] border border-white/5 p-3">
      <p className="text-[11px] text-white/30">
        {label}
      </p>

      <p className="text-lg font-semibold mt-1">
        {value}
      </p>
    </div>
  );
}

function InsightCard({
  tone,
  title,
  detail,
}: {
  tone: "red" | "amber" | "blue" | "emerald";
  title: string;
  detail: string;
}) {
  const styles = {
    red: {
      wrapper: "border-red-500/10 bg-red-500/[0.035]",
      icon: "text-red-300",
      Icon: AlertTriangle,
    },
    amber: {
      wrapper: "border-amber-500/10 bg-amber-500/[0.035]",
      icon: "text-amber-300",
      Icon: Clock3,
    },
    blue: {
      wrapper: "border-blue-500/10 bg-blue-500/[0.035]",
      icon: "text-blue-300",
      Icon: Activity,
    },
    emerald: {
      wrapper: "border-emerald-500/10 bg-emerald-500/[0.035]",
      icon: "text-emerald-300",
      Icon: CheckCircle2,
    },
  }[tone];

  const Icon = styles.Icon;

  return (
    <div
      className={`rounded-2xl border ${styles.wrapper} p-4 flex items-start gap-3`}
    >
      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/5 flex items-center justify-center shrink-0">
        <Icon className={`w-4 h-4 ${styles.icon}`} />
      </div>

      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-white/40 leading-5 mt-1">{detail}</p>
      </div>
    </div>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div className="py-10 text-center text-sm text-white/35">
      {text}
    </div>
  );
}