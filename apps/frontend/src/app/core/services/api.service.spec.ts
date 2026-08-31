import { ApiService } from './api.service';
import { of, throwError } from 'rxjs';

describe('ApiService', () => {
  let service: ApiService;
  let httpClientMock: any;

  beforeEach(() => {
    httpClientMock = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };
    service = new ApiService(httpClientMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Document Repository Operations', () => {
    it('should get documents from backend', (done) => {
      const mockDocs = [{ id: 'doc1', originalName: 'financials.pdf', fileType: 'pdf' }];
      httpClientMock.get.mockReturnValue(of(mockDocs));

      service.getDocuments().subscribe((docs) => {
        expect(docs).toEqual(mockDocs);
        expect(httpClientMock.get).toHaveBeenCalledWith('http://localhost:3000/api/documents');
        done();
      });
    });

    it('should upload document with FormData and optional folder', (done) => {
      const file = new File(['content'], 'sample.txt', { type: 'text/plain' });
      httpClientMock.post.mockReturnValue(of({ id: 'doc2', originalName: 'sample.txt' }));

      service.uploadDocument(file, 'Engineering').subscribe((res) => {
        expect(res.id).toBe('doc2');
        expect(httpClientMock.post).toHaveBeenCalled();
        done();
      });
    });

    it('should handle document deletion', (done) => {
      httpClientMock.delete.mockReturnValue(of(undefined));

      service.deleteDocument('doc1').subscribe(() => {
        expect(httpClientMock.delete).toHaveBeenCalledWith('http://localhost:3000/api/documents/doc1');
        done();
      });
    });

    it('should propagate 403 Forbidden error', (done) => {
      httpClientMock.get.mockReturnValue(throwError(() => ({ status: 403, error: { message: 'Forbidden' } })));

      service.getDocument('doc-forbidden').subscribe({
        error: (err) => {
          expect(err.status).toBe(403);
          done();
        },
      });
    });

    it('should propagate 404 Not Found error', (done) => {
      httpClientMock.get.mockReturnValue(throwError(() => ({ status: 404, error: { message: 'Document not found' } })));

      service.getDocument('doc-missing').subscribe({
        error: (err) => {
          expect(err.status).toBe(404);
          done();
        },
      });
    });
  });

  describe('Dataset Operations', () => {
    it('should fetch datasets from backend', (done) => {
      httpClientMock.get.mockReturnValue(of([{ id: 'ds1', name: 'sales.csv' }]));

      service.getDatasets().subscribe((ds) => {
        expect(ds.length).toBe(1);
        done();
      });
    });
  });

  describe('Conversation & Messaging', () => {
    it('should create new conversation', (done) => {
      const dto = { title: 'Q1 Review' };
      httpClientMock.post.mockReturnValue(of({ id: 'c1', title: 'Q1 Review' }));

      service.createConversation(dto).subscribe((conv) => {
        expect(conv.id).toBe('c1');
        done();
      });
    });

    it('should search conversations by query text', (done) => {
      httpClientMock.get.mockReturnValue(of([{ id: 'c1', title: 'Audit Report' }]));

      service.searchConversations('audit').subscribe((results) => {
        expect(results.length).toBe(1);
        done();
      });
    });
  });

  describe('Access Requests', () => {
    it('should submit access request', (done) => {
      const reqDto = { resourceType: 'document', resourceId: 'doc123', reason: 'Need for audit' };
      httpClientMock.post.mockReturnValue(of({ id: 'req1', status: 'pending' }));

      service.createAccessRequest(reqDto).subscribe((res) => {
        expect(res.id).toBe('req1');
        done();
      });
    });

    it('should fetch pending access requests for admins', (done) => {
      httpClientMock.get.mockReturnValue(of([{ id: 'req1', status: 'pending' }]));

      service.getPendingAccessRequests().subscribe((reqs) => {
        expect(reqs.length).toBe(1);
        done();
      });
    });
  });
});
