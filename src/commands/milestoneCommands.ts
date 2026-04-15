/**
 * Milestone and Sprint commands.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import { Milestone, Sprint, SprintStatus } from '../types';
import * as logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function cmdCreateMilestone(service: IssueService): Promise<void> {
    const name = await vscode.window.showInputBox({
        title: 'New Milestone — Name',
        prompt: 'Enter a name for the milestone (e.g. "v1.0 Release").',
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty.'),
    });
    if (!name) { return; }

    const description = await vscode.window.showInputBox({
        title: 'New Milestone — Description (optional)',
        prompt: 'Short description or goal.',
    });

    const targetDateStr = await vscode.window.showInputBox({
        title: 'New Milestone — Target Date (optional)',
        prompt: 'Enter date in YYYY-MM-DD format, or leave blank.',
        validateInput: (v) => {
            if (!v) { return null; }
            return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Use YYYY-MM-DD format.';
        },
    });

    try {
        const m = await service.createMilestone({
            name: name.trim(),
            description: description?.trim() ?? '',
            targetDate: targetDateStr?.trim() || null,
            completedDate: null,
            workspaceFolder: null,
        });
        void vscode.window.showInformationMessage(`Milestone "${m.name}" created.`);
    } catch (err) {
        logger.showError('Failed to create milestone', err);
    }
}

export async function cmdEditMilestone(service: IssueService, milestone: Milestone): Promise<void> {
    const name = await vscode.window.showInputBox({
        title: `Edit Milestone — "${milestone.name}"`,
        value: milestone.name,
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty.'),
    });
    if (!name) { return; }

    const description = await vscode.window.showInputBox({
        title: 'Edit Milestone — Description',
        value: milestone.description,
    });

    const targetDate = await vscode.window.showInputBox({
        title: 'Edit Milestone — Target Date',
        value: milestone.targetDate ?? '',
        prompt: 'YYYY-MM-DD or blank to clear.',
        validateInput: (v) => {
            if (!v) { return null; }
            return /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Use YYYY-MM-DD format.';
        },
    });

    try {
        await service.updateMilestone(milestone.id, {
            name: name.trim(),
            description: description?.trim() ?? milestone.description,
            targetDate: targetDate?.trim() || null,
        });
    } catch (err) {
        logger.showError('Failed to update milestone', err);
    }
}

export async function cmdDeleteMilestone(service: IssueService, milestone: Milestone): Promise<void> {
    const issueCount = service.getIssues().filter((i) => i.milestoneId === milestone.id).length;
    const confirm = await vscode.window.showWarningMessage(
        `Delete milestone "${milestone.name}"?${issueCount > 0 ? ` ${issueCount} issues will be detached.` : ''} This cannot be undone.`,
        { modal: true },
        'Delete'
    );
    if (confirm !== 'Delete') { return; }

    try {
        await service.deleteMilestone(milestone.id);
        void vscode.window.showInformationMessage(`Milestone "${milestone.name}" deleted.`);
    } catch (err) {
        logger.showError('Failed to delete milestone', err);
    }
}

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------

export async function cmdCreateSprint(service: IssueService): Promise<void> {
    const name = await vscode.window.showInputBox({
        title: 'New Sprint — Name',
        prompt: 'Enter a name for the sprint (e.g. "Sprint 3").',
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty.'),
    });
    if (!name) { return; }

    const description = await vscode.window.showInputBox({
        title: 'New Sprint — Goal (optional)',
        prompt: 'Sprint goal or summary.',
    });

    const startDate = await vscode.window.showInputBox({
        title: 'New Sprint — Start Date (optional)',
        prompt: 'YYYY-MM-DD',
        validateInput: (v) => (!v || /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Use YYYY-MM-DD.'),
    });

    const endDate = await vscode.window.showInputBox({
        title: 'New Sprint — End Date (optional)',
        prompt: 'YYYY-MM-DD',
        validateInput: (v) => (!v || /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Use YYYY-MM-DD.'),
    });

    const statusChoice = await vscode.window.showQuickPick(
        (['planned', 'active', 'completed'] as SprintStatus[]).map((s) => ({ label: s, picked: s === 'planned' })),
        { title: 'New Sprint — Status' }
    );
    if (!statusChoice) { return; }

    try {
        const sprint = await service.createSprint({
            name: name.trim(),
            description: description?.trim() ?? '',
            startDate: startDate?.trim() || null,
            endDate: endDate?.trim() || null,
            status: statusChoice.label,
            workspaceFolder: null,
        });
        void vscode.window.showInformationMessage(`Sprint "${sprint.name}" created.`);
    } catch (err) {
        logger.showError('Failed to create sprint', err);
    }
}

export async function cmdEditSprint(service: IssueService, sprint: Sprint): Promise<void> {
    const name = await vscode.window.showInputBox({
        title: `Edit Sprint — "${sprint.name}"`,
        value: sprint.name,
        validateInput: (v) => (v.trim() ? null : 'Name cannot be empty.'),
    });
    if (!name) { return; }

    const statusChoice = await vscode.window.showQuickPick(
        (['planned', 'active', 'completed'] as SprintStatus[]).map((s) => ({ label: s, picked: s === sprint.status })),
        { title: 'Edit Sprint — Status' }
    );
    if (!statusChoice) { return; }

    try {
        await service.updateSprint(sprint.id, {
            name: name.trim(),
            status: statusChoice.label,
        });
    } catch (err) {
        logger.showError('Failed to update sprint', err);
    }
}

export async function cmdDeleteSprint(service: IssueService, sprint: Sprint): Promise<void> {
    const issueCount = service.getIssues().filter((i) => i.sprintId === sprint.id).length;
    const confirm = await vscode.window.showWarningMessage(
        `Delete sprint "${sprint.name}"?${issueCount > 0 ? ` ${issueCount} issues will be detached.` : ''} This cannot be undone.`,
        { modal: true },
        'Delete'
    );
    if (confirm !== 'Delete') { return; }

    try {
        await service.deleteSprint(sprint.id);
        void vscode.window.showInformationMessage(`Sprint "${sprint.name}" deleted.`);
    } catch (err) {
        logger.showError('Failed to delete sprint', err);
    }
}
