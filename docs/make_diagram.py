import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

BG, PANEL, TEAL, AMBER, TEXT, MUTED = "#0b1f2a", "#10303f", "#2ec4b6", "#ffb703", "#e8f1f2", "#8fb3bd"

fig, ax = plt.subplots(figsize=(17, 9.5), dpi=150)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)
ax.set_xlim(0, 170)
ax.set_ylim(0, 95)
ax.axis("off")


def box(x, y, w, h, title, sub="", edge=TEAL, tsize=10.5, ssize=8.3):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.3,rounding_size=1.1",
                                linewidth=1.8, edgecolor=edge, facecolor=PANEL))
    ax.text(x + w / 2, y + h * (0.64 if sub else 0.5), title, ha="center", va="center", color=TEXT,
            fontsize=tsize, fontweight="bold")
    if sub:
        ax.text(x + w / 2, y + h * 0.28, sub, ha="center", va="center", color=MUTED, fontsize=ssize, linespacing=1.35)


def group(x, y, w, h, label, color):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.3,rounding_size=1.5",
                                linewidth=1.5, edgecolor=color, facecolor="none", linestyle="--"))
    ax.text(x + 2, y + h - 2.8, label, color=color, fontsize=10, fontweight="bold")


def arrow(p1, p2, color=TEAL, ls="-", rad=0.0, lw=1.9):
    ax.annotate("", xy=p2, xytext=p1,
                arrowprops=dict(arrowstyle="-|>", color=color, lw=lw, linestyle=ls,
                                connectionstyle=f"arc3,rad={rad}"))


ax.text(85, 91.5, "End-to-End CI/CD for a Serverless Workflow (AWS CDK Pipelines)", ha="center", color=TEAL,
        fontsize=20, fontweight="bold")
ax.text(85, 87.6, "Push to main triggers build, tests, self-update, deploy and an automated workflow validation",
        ha="center", color=MUTED, fontsize=10.5)

# source
box(3, 62, 22, 14, "GitHub", "aws-capstone-four\nmain branch")

# pipeline
group(30, 58, 138, 24, "AWS CodePipeline: workflow-cdk-pipeline", AMBER)
stages = [
    ("1 Source", "GitHub connection\npush trigger"),
    ("2 Build", "npm ci, tsc, jest\ncdk synth"),
    ("3 UpdatePipeline", "self-mutation if the\npipeline code changed"),
    ("4 Assets", "Lambda code and\ntemplates to S3"),
    ("5 Dev", "CloudFormation deploy\nthen ValidateWorkflow"),
]
xs = [34, 60, 86, 112, 138]
for x, (t, s) in zip(xs, stages):
    box(x, 62, 25, 14, t, s, edge=AMBER if t.startswith("5") else TEAL, tsize=10)
arrow((25.5, 69), (33.5, 69))
ax.text(29.5, 71, "webhook", color=MUTED, fontsize=8, ha="center")
for x in xs[:-1]:
    arrow((x + 25.5, 69), (x + 27.5, 69))

# deployed stack
group(30, 4, 138, 49, "Dev-WorkflowStack (deployed by CloudFormation)", TEAL)
ax.text(34, 43.5, "Step Functions state machine (Standard)", color=TEXT, fontsize=9.5, fontweight="bold")

box(34, 29, 22, 11, "Prepare Input", "Pass state\n(execution start)", tsize=9.5)
box(60, 29, 30, 11, "Retrieve Config From SSM", "Task: Lambda invoke", tsize=9.5)
box(94, 29, 20, 11, "Config Valid?", "Choice", tsize=9.5)
box(119, 35, 26, 8, "Workflow Succeeded", "", edge=TEAL, tsize=9)
box(119, 22, 30, 11, "Handle Failure", "Pass, then Fail state", edge=AMBER, tsize=9.5)
arrow((56.5, 34.5), (59.5, 34.5))
arrow((90.5, 34.5), (93.5, 34.5))
arrow((114.5, 36), (118.5, 38.5))
arrow((114.5, 33), (118.5, 28.5), color=AMBER)
ax.text(75, 41.7, "Retry x2 with backoff, then Catch States.ALL", color=AMBER, fontsize=8.5, ha="center")
arrow((88, 28.4), (118.5, 25.5), color=AMBER, ls="--")
ax.text(104, 23.2, "Catch", color=AMBER, fontsize=8.5, ha="center")

box(60, 8, 30, 12, "Lambda (Python 3.12)", "reads the parameter at runtime\nscoped ssm:GetParameter", tsize=9.5)
box(96, 8, 28, 12, "SSM Parameter Store", "/app/config/greeting", tsize=9.5)
arrow((75, 28.5), (75, 20.5))
arrow((90.5, 14), (95.5, 14))
ax.text(93, 16, "GetParameter", color=MUTED, fontsize=7.8, ha="center")

box(36, 8, 20, 12, "CloudWatch Logs", "Lambda and\nstate machine logs", tsize=9, ssize=8)
arrow((59.5, 13), (56.5, 13), color=MUTED, ls="--")
box(130, 8, 34, 12, "Alarms + SNS email", "failed executions,\nLambda errors", edge=AMBER, tsize=9.5)

# pipeline to stack
arrow((150, 61.5), (150, 53.5), color=AMBER, lw=2.2)
ax.text(152, 56.2, "deploy + validate", color=AMBER, fontsize=8.5)
fig.savefig("architecture-diagram.png", facecolor=BG, bbox_inches="tight")
print("saved")
