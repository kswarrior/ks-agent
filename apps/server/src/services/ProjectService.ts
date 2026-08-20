import { DatabaseService } from '@ks-agent/database';
import { AppContext } from './AppContext';

export class ProjectService {
  private db: DatabaseService;
  private appContext: AppContext;

  constructor(appContext: AppContext) {
    this.db = appContext.db;
    this.appContext = appContext;
  }

  createProject(name: string, rootDirectory: string, settings = {}): string {
    return this.db.createProject(name, rootDirectory, settings);
  }

  getAllProjects() {
    return this.db.getAllProjects();
  }

  getProject(id: string) {
    return this.db.getProject(id);
  }

  updateProject(id: string, updates: { name?: string; rootDirectory?: string; settings?: object }) {
    return this.db.updateProject(id, updates);
  }

  deleteProject(id: string) {
    // Verify no running agents
    return this.db.deleteProject(id);
  }

  getChats(projectId: string) {
    return this.db.getChatsByProject(projectId);
  }

  createChat(projectId: string, title: string) {
    return this.db.createChat(projectId, title);
  }

  updateChat(chatId: string, updates: { title?: string; status?: string }) {
    return this.db.updateChat(chatId, updates);
  }

  deleteChat(chatId: string) {
    return this.db.deleteChat(chatId);
  }

  getMessages(chatId: string) {
    return this.db.getMessages(chatId);
  }

  getChat(chatId: string) {
    return this.db.getChat(chatId);
  }
}