/**
 * TemplateService — helper façade for template CRUD that adds validation.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import { IssueDatabase } from '../database/IssueDatabase';
import { IssueTemplate, Issue } from '../types';
import { generateId, nowIso } from '../utils/idGenerator';

export class TemplateService {
    constructor(private readonly db: IssueDatabase) { }

    getAll(): IssueTemplate[] {
        return this.db.getTemplates();
    }

    get(id: string): IssueTemplate | null {
        return this.db.getTemplate(id);
    }

    async create(
        partial: Omit<IssueTemplate, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<IssueTemplate> {
        const now = nowIso();
        const template: IssueTemplate = {
            ...partial,
            id: generateId(),
            createdAt: now,
            updatedAt: now,
        };
        await this.db.saveTemplates([...this.db.getTemplates(), template]);
        return template;
    }

    async update(
        id: string,
        changes: Partial<Omit<IssueTemplate, 'id' | 'createdAt'>>
    ): Promise<IssueTemplate> {
        const templates = this.db.getTemplates();
        const idx = templates.findIndex((t) => t.id === id);
        if (idx === -1) {
            throw new Error(`Template not found: ${id}`);
        }
        const updated: IssueTemplate = {
            ...templates[idx],
            ...changes,
            id,
            createdAt: templates[idx].createdAt,
            updatedAt: nowIso(),
        };
        templates[idx] = updated;
        await this.db.saveTemplates(templates);
        return updated;
    }

    async delete(id: string): Promise<boolean> {
        const templates = this.db.getTemplates();
        const filtered = templates.filter((t) => t.id !== id);
        if (filtered.length === templates.length) {
            return false;
        }
        await this.db.saveTemplates(filtered);
        return true;
    }

    /**
     * Returns the default field values to pre-fill when creating an issue
     * from this template.
     */
    getDefaults(templateId: string): Partial<Pick<Issue, 'type' | 'severity' | 'urgency' | 'tags' | 'description' | 'templateId'>> | null {
        const tmpl = this.db.getTemplate(templateId);
        if (!tmpl) {
            return null;
        }
        return {
            type: tmpl.type,
            severity: tmpl.defaultSeverity,
            urgency: tmpl.defaultUrgency,
            tags: [...tmpl.defaultTags],
            description: tmpl.bodyTemplate,
            templateId: tmpl.id,
        };
    }
}
